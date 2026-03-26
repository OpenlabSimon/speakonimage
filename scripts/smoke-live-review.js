#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3005';
const OUTPUT_PATH = process.env.OUTPUT_PATH || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'codex123';
const TEST_AUDIO_VOICE = process.env.TEST_AUDIO_VOICE || 'Samantha';
const TEST_AUDIO_RATE = Number(process.env.TEST_AUDIO_RATE || 180);
const STRICT_QUALITY = /^(1|true|yes)$/i.test(process.env.STRICT_QUALITY || '');
const SMOKE_AUTH_BYPASS = /^(1|true|yes)$/i.test(process.env.SMOKE_AUTH_BYPASS || '');
const SMOKE_LIVE_BYPASS = /^(1|true|yes)$/i.test(process.env.SMOKE_LIVE_BYPASS || '');
const INVITE_COOKIE_NAME = process.env.INVITE_COOKIE_NAME || 'speakonimage_invite';
const INVITE_COOKIE =
  process.env.INVITE_COOKIE ||
  process.env.INVITE_GATE_TOKENS?.split(/[\n,]/).map((token) => token.trim()).find(Boolean) ||
  '';
const TEST_EMAIL =
  process.env.TEST_EMAIL ||
  `codex-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const TOPIC_ID = process.env.TOPIC_ID || crypto.randomUUID();
const DEFAULT_TURN_TEXTS = [
  'Hi, I am building a speaking app for English learners. It gives instant feedback and short practice topics.',
  'The main problem is that many learners feel nervous when they speak, so I want to make practice easier and less stressful.',
];
const STOPWORDS = new Set([
  'about',
  'after',
  'am',
  'and',
  'are',
  'because',
  'building',
  'for',
  'from',
  'gives',
  'have',
  'instant',
  'into',
  'less',
  'main',
  'make',
  'many',
  'that',
  'the',
  'them',
  'they',
  'this',
  'want',
  'when',
  'with',
]);

const TOPIC_PAYLOAD = {
  id: TOPIC_ID,
  type: 'expression',
  chinesePrompt: 'Talk about a product you are building and what problem it solves.',
  keyPoints: ['what it is', 'who it helps', 'why it matters'],
  guidingQuestions: ['What are you building?', 'Who will use it?', 'What challenge does it solve?'],
  suggestedVocab: ['prototype', 'feedback', 'feature', 'workflow'],
  grammarHints: ['use present simple for facts', 'use because to explain reasons'],
  difficultyMetadata: {
    targetCefr: 'B1',
    vocabComplexity: 0,
    grammarComplexity: 0,
  },
};

function logStep(step) {
  console.log(`[smoke-live-review] ${step}`);
}

async function main() {
  const fixtureAudio = buildFixtureAudio();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const smokeBypassState = SMOKE_AUTH_BYPASS ? createSmokeBypassState() : null;
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  const consoleLines = [];
  const wsEvents = [];
  const authResponses = [];
  let reviewResponse = null;

  try {
    page.on('console', (message) => {
      consoleLines.push(`${message.type()}: ${message.text()}`);
    });

    page.on('websocket', (ws) => {
      if (!ws.url().includes('BidiGenerateContentConstrained')) {
        return;
      }

      wsEvents.push(`ws-open: ${ws.url()}`);
      ws.on('framesent', (event) => {
        wsEvents.push(`sent: ${truncateFrame(event.payload)}`);
      });
      ws.on('framereceived', (event) => {
        wsEvents.push(`received: ${truncateFrame(event.payload)}`);
      });
      ws.on('close', () => {
        wsEvents.push('ws-close');
      });
    });

    page.on('response', async (response) => {
      if (response.url().includes('/api/auth/')) {
        try {
          authResponses.push({
            url: response.url(),
            status: response.status(),
            body: await response.text(),
          });
        } catch {
          authResponses.push({
            url: response.url(),
            status: response.status(),
            body: '<unreadable>',
          });
        }
      }

      if (!response.url().includes('/api/sessions/') || !response.url().includes('/review-summary')) {
        return;
      }

      try {
        reviewResponse = await response.json();
      } catch {
        reviewResponse = {
          success: false,
          error: `Failed to parse review response with status ${response.status()}`,
        };
      }
    });

    if (smokeBypassState) {
      await setupSmokeAuthBypass(context, smokeBypassState);
    }

    await page.addInitScript(({ topicPayload, fixtureAudioTurns, smokeAuthBypass, smokeLiveBypass }) => {
      function decodePcmBase64(base64) {
        const binary = atob(base64);
        const sampleCount = Math.floor(binary.length / 2);
        const output = new Float32Array(sampleCount);

        for (let index = 0; index < sampleCount; index += 1) {
          const lo = binary.charCodeAt(index * 2);
          const hi = binary.charCodeAt(index * 2 + 1);
          let value = (hi << 8) | lo;
          if (value >= 0x8000) {
            value -= 0x10000;
          }
          output[index] = value / 32768;
        }

        return output;
      }

      const turnQueue = fixtureAudioTurns.map((turn) => ({
        ...turn,
        samples: decodePcmBase64(turn.pcmBase64),
        replyText: turn.index === 1
          ? 'Thanks. Tell me more about the problem it solves.'
          : 'That is clear. Keep adding specific examples when you explain it.',
      }));

      let audioTurnIndex = 0;
      let responseTurnIndex = 0;

      function nextTurnSamples() {
        const turn = turnQueue[Math.min(audioTurnIndex, turnQueue.length - 1)];
        audioTurnIndex += 1;
        return turn?.samples || new Float32Array(1024);
      }

      function nextTurnPayload() {
        const turn =
          turnQueue[Math.min(responseTurnIndex, turnQueue.length - 1)] || turnQueue[turnQueue.length - 1];
        responseTurnIndex += 1;
        return turn;
      }

    class FakeGainNode {
      gain = { value: 1 };
      connect() {}
      disconnect() {}
    }

    class FakeScriptProcessorNode {
      onaudioprocess = null;
      connect() {}
      disconnect() {}
    }

    class FakeMediaStreamSource {
      connect(processor) {
        const samples = nextTurnSamples();
        let offset = 0;

        const emitChunk = () => {
          if (offset >= samples.length) {
            return;
          }

          const slice = samples.subarray(offset, Math.min(offset + 1024, samples.length));
          const chunk = new Float32Array(1024);
          chunk.set(slice);
          processor.onaudioprocess?.({
            inputBuffer: {
              getChannelData: () => chunk,
            },
          });

          offset += slice.length;

          if (offset < samples.length) {
            const delayMs = Math.max(32, Math.round((slice.length / 16000) * 1000));
            this.timeoutId = setTimeout(emitChunk, delayMs);
          }
        };

        emitChunk();
      }
      disconnect() {
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
        }
      }
    }

    class FakeAudioContext {
      constructor() {
        this.sampleRate = 16000;
        this.destination = {};
      }

      async resume() {}
      async close() {}
      createMediaStreamSource() {
        return new FakeMediaStreamSource();
      }
      createScriptProcessor() {
        return new FakeScriptProcessorNode();
      }
      createGain() {
        return new FakeGainNode();
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
          getAudioTracks: () => [{
            getSettings: () => ({
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }),
          }],
        }),
      },
    });

      if (smokeLiveBypass) {
        class FakeLiveWebSocket {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;

          constructor(url) {
            this.url = url;
            this.readyState = FakeLiveWebSocket.CONNECTING;
            setTimeout(() => {
              this.readyState = FakeLiveWebSocket.OPEN;
              this.onopen?.();
            }, 10);
          }

          send(payload) {
            let parsed = null;
            try {
              parsed = JSON.parse(payload);
            } catch {
              parsed = null;
            }

            if (parsed?.setup) {
              this.#emit({ setupComplete: {} }, 10);
              return;
            }

            if (parsed?.realtimeInput?.activityEnd || parsed?.realtimeInput?.audioStreamEnd) {
              const turn = nextTurnPayload();
              this.#emit({ serverContent: { inputTranscription: { text: turn.text } } }, 20);
              this.#emit({
                serverContent: {
                  outputTranscription: { text: turn.replyText },
                  modelTurn: { parts: [{ text: turn.replyText }] },
                },
              }, 40);
              this.#emit({ serverContent: { turnComplete: true } }, 60);
            }
          }

          close(code = 1000) {
            this.readyState = FakeLiveWebSocket.CLOSED;
            setTimeout(() => {
              this.onclose?.({ code });
            }, 10);
          }

          #emit(payload, delayMs) {
            setTimeout(() => {
              this.onmessage?.({ data: JSON.stringify(payload) });
            }, delayMs);
          }
        }

        Object.defineProperty(window, 'WebSocket', {
          configurable: true,
          writable: true,
          value: FakeLiveWebSocket,
        });
      }

      if (smokeAuthBypass) {
        try {
          window.localStorage.setItem('currentTopic', JSON.stringify(topicPayload));
        } catch {
          // ignore localStorage failures in smoke mode
        }
      }

    }, {
      topicPayload: buildSmokeTopic(),
      fixtureAudioTurns: fixtureAudio.turns,
      smokeAuthBypass: SMOKE_AUTH_BYPASS,
      smokeLiveBypass: SMOKE_LIVE_BYPASS,
    });

    logStep(`fixture_audio_ready:${fixtureAudio.turns.map((turn) => `${turn.index}:${turn.durationMs}ms`).join(',')}`);
    logStep('browser_ready');

    if (SMOKE_AUTH_BYPASS) {
      logStep('auth_bypass_enabled');
    } else if (INVITE_COOKIE) {
      logStep('claim_invite_start');
      const inviteResponse = await context.request.post(`${BASE_URL}/api/invite/claim`, {
        data: { token: INVITE_COOKIE },
      });

      if (!inviteResponse.ok()) {
        throw new Error(`Invite claim failed with status ${inviteResponse.status()}`);
      }
      logStep('claim_invite_done');
    }

    let seededTopic;
    if (SMOKE_AUTH_BYPASS) {
      seededTopic = smokeBypassState.topic;
      logStep(`seed_topic_bypassed:${seededTopic.id}`);
    } else {
      logStep('register_start');
      await registerUser(page);
      logStep('register_done');
      logStep('seed_topic_start');
      seededTopic = await seedTopic(page);
      logStep(`seed_topic_done:${seededTopic.id}`);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((topic) => {
        window.localStorage.setItem('currentTopic', JSON.stringify(topic));
      }, seededTopic);
    }

    logStep('practice_page_open_start');
    await page.goto(`${BASE_URL}/topic/practice`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Speak for 3 to 5 turns', { timeout: 30000 });
    await getLivePrimaryButton(page, /连接 Live/).waitFor({ timeout: 25000 });
    logStep('practice_page_open_done');

    logStep('wait_active_session_start');
    const activeSession = await waitForActiveSession(page, seededTopic.id);
    logStep(`wait_active_session_done:${activeSession.id}`);

    logStep('connect_live_start');
    await clickLivePrimaryButton(page, /连接 Live/);
    await waitForLivePrimaryButton(page, /开始这一轮|已连上，点一下就能开始这一轮/);
    logStep('connect_live_done');

    logStep('run_turn_1_start');
    await runTurn(page, 1, fixtureAudio.turns[0]?.durationMs);
    logStep('run_turn_1_done');
    logStep('run_turn_2_start');
    await runTurn(page, 2, fixtureAudio.turns[1]?.durationMs);
    logStep('run_turn_2_done');

    const endReviewButton = page.getByTestId('live-session-review-button');
    await endReviewButton.waitFor({ timeout: 20000 });
    logStep('generate_review_click');
    await endReviewButton.click();

    logStep('wait_review_response_start');
    await waitForReviewResponse(() => reviewResponse, 90000);
    logStep('wait_review_response_done');

    logStep('wait_review_card_start');
    let reviewCardVisible = false;
    try {
      await page.getByTestId('live-session-review-card').waitFor({ timeout: 20000 });
      await page.getByTestId('live-session-review-source-count').waitFor({ timeout: 20000 });
      reviewCardVisible = true;
      logStep('wait_review_card_done');
    } catch {
      logStep('wait_review_card_timeout');
    }

    logStep('wait_ended_session_start');
    const endedSession = await waitForEndedSession(page, seededTopic.id);
    logStep(`wait_ended_session_done:${endedSession.id}`);
    const sessionMessages = await fetchJson(page, `/api/sessions/${endedSession.id}/messages`);
    const reviewCard = reviewCardVisible ? await readReviewCard(page) : buildFallbackReviewCard(reviewResponse);
    const diagnostics = await readDiagnosticsFromPage(page).catch(() => null);
    const sidebarChecks = await verifySidebarNavigation(page, endedSession.id);
    const qualityChecks = buildQualityChecks({
      fixtureAudio,
      reviewResponse,
      reviewCard,
      sessionMessages,
    });

    const result = {
      success: Boolean(reviewResponse?.success && reviewCard?.reviewText),
      qualityPass: qualityChecks.failed.length === 0,
      baseUrl: BASE_URL,
      smokeAuthBypass: SMOKE_AUTH_BYPASS,
      smokeLiveBypass: SMOKE_LIVE_BYPASS,
      inviteCookieApplied: Boolean(INVITE_COOKIE),
      testEmail: TEST_EMAIL,
      topicId: seededTopic.id,
      activeSessionId: activeSession.id,
      endedSessionId: endedSession.id,
      liveTurnCount: reviewCard?.sourceMessageCount ? Math.floor(reviewCard.sourceMessageCount / 2) : null,
      fixtureAudio: {
        voice: TEST_AUDIO_VOICE,
        rate: TEST_AUDIO_RATE,
        turns: fixtureAudio.turns.map((turn) => ({
          index: turn.index,
          text: turn.text,
          durationMs: turn.durationMs,
          sampleCount: turn.sampleCount,
        })),
      },
      qualityChecks,
      reviewResponse,
      reviewCard,
      sessionMessages,
      sidebarChecks,
      diagnostics,
      consoleLines,
      wsEvents,
      authResponses,
    };

    if (OUTPUT_PATH) {
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    }

    console.log(JSON.stringify(result, null, 2));

    if (STRICT_QUALITY && qualityChecks.failed.length > 0) {
      throw new Error(`Quality checks failed: ${qualityChecks.failed.map((item) => item.name).join(', ')}`);
    }
  } finally {
    await browser.close();
    cleanupFixtureAudio(fixtureAudio.tempDir);
  }
}

function createSmokeBypassState() {
  return {
    user: {
      id: 'smoke-user',
      email: TEST_EMAIL,
      name: 'Smoke User',
      isGuest: false,
    },
    topic: buildSmokeTopic(),
    sessions: [],
    messagesBySession: new Map(),
    coachPreferences: {
      reviewMode: 'all',
      autoPlayAudio: false,
      characterId: 'mei',
      voiceId: '',
    },
  };
}

function buildSmokeTopic() {
  return {
    id: TOPIC_ID,
    type: TOPIC_PAYLOAD.type,
    chinesePrompt: TOPIC_PAYLOAD.chinesePrompt,
    keyPoints: TOPIC_PAYLOAD.keyPoints,
    guidingQuestions: TOPIC_PAYLOAD.guidingQuestions,
    suggestedVocab: TOPIC_PAYLOAD.suggestedVocab.map((word) => ({
      word,
      phonetic: '',
      partOfSpeech: '',
      chinese: '',
      exampleContext: '',
    })),
    grammarHints: TOPIC_PAYLOAD.grammarHints.map((point) => ({
      point,
      explanation: point,
      pattern: '',
      example: '',
    })),
    difficultyMetadata: TOPIC_PAYLOAD.difficultyMetadata,
  };
}

async function setupSmokeAuthBypass(context, state) {
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    const method = request.method().toUpperCase();

    if (pathname === '/api/auth/session' && method === 'GET') {
      return fulfillJson(route, 200, {
        user: state.user,
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    }

    if (pathname === '/api/live/token' && method === 'POST' && SMOKE_LIVE_BYPASS) {
      return fulfillJson(route, 200, {
        success: true,
        data: {
          provider: 'gemini-live',
          tokenName: 'auth_tokens/smoke-token',
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          wsUrl: 'wss://smoke.live.test/BidiGenerateContentConstrained',
        },
      });
    }

    if (pathname === '/api/user/coach-preferences') {
      if (method === 'GET') {
        return fulfillJson(route, 200, {
          success: true,
          data: state.coachPreferences,
        });
      }

      if (method === 'PATCH') {
        const payload = parseRouteJson(request);
        state.coachPreferences = {
          ...state.coachPreferences,
          ...(payload || {}),
        };
        return fulfillJson(route, 200, {
          success: true,
          data: state.coachPreferences,
        });
      }
    }

    if (pathname === '/api/user/profile' && method === 'GET') {
      return fulfillJson(route, 200, {
        success: true,
        data: buildSmokeProfile(state),
      });
    }

    if (pathname === '/api/sessions' && method === 'POST') {
      const payload = parseRouteJson(request) || {};
      const session = {
        id: crypto.randomUUID(),
        accountId: state.user.id,
        speakerId: null,
        topicId: payload.topicId || state.topic.id,
        sessionType: payload.sessionType || 'practice',
        status: 'active',
        startedAt: new Date().toISOString(),
        endedAt: null,
        messageCount: 0,
        extractedData: null,
      };
      state.sessions.push(session);
      state.messagesBySession.set(session.id, []);

      return fulfillJson(route, 200, {
        success: true,
        data: session,
      });
    }

    if (pathname === '/api/sessions' && method === 'GET') {
      const status = searchParams.get('status');
      const sessions = status
        ? state.sessions.filter((session) => session.status === status)
        : state.sessions;

      return fulfillJson(route, 200, {
        success: true,
        data: sessions,
      });
    }

    const reviewMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/review-summary$/);
    if (reviewMatch && method === 'POST') {
      const sessionId = reviewMatch[1];
      const messages = state.messagesBySession.get(sessionId) || [];
      const liveMessages = messages.filter((message) => message.metadata?.source === 'live_coach');
      const reviewMessages = liveMessages.length >= 2
        ? liveMessages
        : messages.filter((message) => message.role !== 'system');
      const review = buildSmokeReview(reviewMessages);

      return fulfillJson(route, 200, {
        success: true,
        data: review,
      });
    }

    const messagesMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const sessionId = messagesMatch[1];
      const messages = state.messagesBySession.get(sessionId) || [];

      if (method === 'POST') {
        const payload = parseRouteJson(request) || {};
        const message = {
          id: crypto.randomUUID(),
          sessionId,
          role: payload.role || 'assistant',
          content: payload.content || '',
          contentType: payload.contentType || 'text',
          metadata: payload.metadata || {},
          createdAt: new Date().toISOString(),
        };
        messages.push(message);
        state.messagesBySession.set(sessionId, messages);
        const session = state.sessions.find((item) => item.id === sessionId);
        if (session) {
          session.messageCount = messages.length;
        }

        return fulfillJson(route, 200, {
          success: true,
          data: message,
        });
      }

      if (method === 'GET') {
        return fulfillJson(route, 200, {
          success: true,
          data: {
            messages,
            total: messages.length,
          },
        });
      }
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const session = state.sessions.find((item) => item.id === sessionId);

      if (!session) {
        return fulfillJson(route, 404, {
          success: false,
          error: 'Session not found',
        });
      }

      if (method === 'DELETE' || method === 'PATCH') {
        session.status = 'ended';
        session.endedAt = new Date().toISOString();
        return fulfillJson(route, 200, {
          success: true,
          data: session,
        });
      }

      if (method === 'GET') {
        return fulfillJson(route, 200, {
          success: true,
          data: session,
        });
      }
    }

    return route.continue();
  });
}

function fulfillJson(route, status, payload) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function parseRouteJson(request) {
  try {
    const body = request.postData();
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function buildSmokeReview(messages) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const combinedUserText = userMessages.map((message) => message.content).join(' ');
  const keywords = Array.from(new Set(
    combinedUserText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
  )).slice(0, 4);
  const summary = userMessages[0]?.content
    ? `这次你已经围绕“${keywords[0] || '当前话题'}”连续说了 ${userMessages.length} 轮。`
    : '这次你已经完成了一段可复盘的 live 对话。';
  const strengths = [
    userMessages.length >= 2 ? '你能连续接住多轮来回。' : '你已经完成了一轮有效表达。',
    keywords[0] ? `你已经把 ${keywords[0]} 这类关键词说出来了。` : '你已经把核心意思表达出来了。',
  ].filter(Boolean);
  const focusAreas = [
    '继续把句子收完整，不要太早停顿。',
    assistantMessages.length > 0 ? '听完老师追问后，下一轮尽量先直接回答再补充细节。': '下一轮继续主动展开细节。',
  ];
  const goodPhrases = keywords.length > 0 ? keywords : ['instant feedback', 'less stressful'];
  const nextActions = [
    '下一轮保持同一主题，但每次多说一句 why 或 how。',
    '遇到卡顿时先用简单句顶住，再继续展开。',
  ];
  const reviewText = [
    '这轮 live 对话已经具备完整复盘价值。',
    summary,
    `做得对的地方：${strengths.join(' ')}`,
    `下一步重点：${focusAreas.join(' ')}`,
    `建议保留的表达：${goodPhrases.join(', ')}。`,
  ].join('\n\n');

  return {
    headline: '本次对话复盘',
    summary,
    strengths,
    focusAreas,
    goodPhrases,
    nextActions,
    reviewText,
    speechScript: reviewText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim(),
    generatedAt: new Date().toISOString(),
    sourceMessageCount: messages.length,
  };
}

function buildSmokeProfile(state) {
  const now = new Date().toISOString();
  const sessions = [...state.sessions].sort((left, right) => {
    return new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
  });
  const latestSession = sessions[0] || null;
  const latestMessages = latestSession ? (state.messagesBySession.get(latestSession.id) || []) : [];
  const latestAssistantMessage = [...latestMessages].reverse().find((message) => message.role === 'assistant') || null;

  return {
    profile: {
      estimatedCefr: 'B1',
      confidence: 0.82,
      lastUpdated: now,
      vocabularyProfile: {
        uniqueWordCount: 12,
        cefrDistribution: { B1: 12 },
        weakWords: [],
      },
      grammarProfile: {
        topErrors: [],
      },
      usageProfile: {
        snapshots: [],
      },
      interests: [],
      goals: [],
      entities: [],
      recentVocabulary: [],
      memorySnippets: [],
      coachMemory: {
        longTermReminders: [],
        currentRoundReminders: [],
      },
      recommendations: {
        topics: [],
        vocabulary: [],
        examples: [],
        nextFocus: ['继续把句子收完整'],
        generatedAt: now,
      },
      recommendationFeedback: [],
    },
    stats: {
      topicCount: sessions.length,
      submissionCount: sessions.length,
      streak: 1,
      vocabSize: 12,
      activeDays: 1,
    },
    recentSubmissions: latestSession
      ? [{
          id: latestSession.id,
          transcribedText: latestMessages.find((message) => message.role === 'user')?.content || '',
          rawAudioUrl: null,
          evaluation: {},
          difficultyAssessment: null,
          createdAt: latestSession.startedAt,
          topic: {
            id: state.topic.id,
            type: state.topic.type,
            originalInput: state.topic.chinesePrompt,
          },
        }]
      : [],
    recentTopics: [{
      id: state.topic.id,
      type: state.topic.type,
      originalInput: state.topic.chinesePrompt,
      createdAt: now,
      submissionCount: sessions.length,
      latestDraft: null,
      draftCount: 0,
    }],
    recentCoachFeedback: latestAssistantMessage
      ? [{
          id: latestAssistantMessage.id,
          content: latestAssistantMessage.content,
          speechScript: latestAssistantMessage.content,
          audioUrl: null,
          createdAt: latestAssistantMessage.createdAt,
          source: 'coach_review',
          topic: {
            id: state.topic.id,
            type: state.topic.type,
            originalInput: state.topic.chinesePrompt,
          },
        }]
      : [],
  };
}

async function verifySidebarNavigation(page, sessionId) {
  const result = {
    reviewListLoaded: false,
    sessionDetailLoaded: false,
    coachLoaded: false,
  };

  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Conversation history', { timeout: 30000 });
  result.reviewListLoaded = true;

  await page.goto(`${BASE_URL}/profile/sessions/${sessionId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Conversation transcript', { timeout: 30000 });
  await page.waitForSelector('text=Final review', { timeout: 30000 });
  result.sessionDetailLoaded = true;

  await page.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Current coach', { timeout: 30000 });
  await page.waitForSelector('text=下一步怎么用', { timeout: 30000 });
  result.coachLoaded = true;

  return result;
}

async function registerUser(page) {
  await page.goto(`${BASE_URL}/auth/register`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('邮箱').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.locator('#confirmPassword').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '创建账号' }).click();

  const authenticated = await waitForAuthenticatedSession(page, 60000);
  if (!authenticated) {
    const errorText = await page.locator('text=/失败|错误|已存在|already/i').allInnerTexts().catch(() => []);
    throw new Error(
      `Registration did not establish an authenticated session. URL=${page.url()} errorText=${errorText.join(' | ') || '<none>'}`
    );
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
}

async function waitForAuthenticatedSession(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const session = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        return response.json();
      } catch {
        return null;
      }
    }).catch(() => null);

    if (session?.user?.id) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function seedTopic(page) {
  const response = await page.evaluate(async (topicPayload) => {
    const result = await fetch('/api/user/topics/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: topicPayload.type,
        originalInput: topicPayload.chinesePrompt,
        topicContent: {
          chinesePrompt: topicPayload.chinesePrompt,
          keyPoints: topicPayload.keyPoints,
          guidingQuestions: topicPayload.guidingQuestions,
          suggestedVocab: topicPayload.suggestedVocab.map((word) => ({
            word,
            phonetic: '',
            partOfSpeech: '',
            chinese: '',
            exampleContext: '',
          })),
          grammarHints: topicPayload.grammarHints.map((point) => ({
            point,
            explanation: point,
            pattern: '',
            example: '',
          })),
          difficultyMetadata: topicPayload.difficultyMetadata,
        },
      }),
    });

    return result.json();
  }, TOPIC_PAYLOAD);

  if (!response?.success || !response.data?.id) {
    throw new Error(`Failed to seed topic for smoke run: ${response?.error || 'unknown error'}`);
  }

  return {
    id: response.data.id,
    type: TOPIC_PAYLOAD.type,
    chinesePrompt: response.data.chinesePrompt || TOPIC_PAYLOAD.chinesePrompt,
    keyPoints: response.data.keyPoints || TOPIC_PAYLOAD.keyPoints,
    guidingQuestions: response.data.guidingQuestions || TOPIC_PAYLOAD.guidingQuestions,
    suggestedVocab: response.data.suggestedVocab || [],
    grammarHints: response.data.grammarHints || [],
    difficultyMetadata: response.data.difficultyMetadata || TOPIC_PAYLOAD.difficultyMetadata,
  };
}

async function waitForActiveSession(page, topicId) {
  return waitForSession(page, topicId, 'active', 30000);
}

async function waitForEndedSession(page, topicId) {
  return waitForSession(page, topicId, 'ended', 45000);
}

async function waitForSession(page, topicId, status, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await fetchJson(page, `/api/sessions?status=${status}&limit=10`);
      const sessions = Array.isArray(result?.data) ? result.data : [];
      const match = sessions.find((session) => session.topicId === topicId && session.status === status);
      if (match) {
        return match;
      }
    } catch (error) {
      lastError = error;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Timed out waiting for ${status} session for topic ${topicId}${lastError ? `: ${String(lastError)}` : ''}`
  );
}

async function runTurn(page, expectedTurnCount, fixtureDurationMs) {
  await clickLivePrimaryButton(page, /开始这一轮|已连上，点一下就能开始这一轮/);
  await waitForLivePrimaryButton(page, /结束这一轮/);
  const waitMs = Math.max(2600, Math.min(9000, Math.round((fixtureDurationMs || 2400) + 1200)));
  await page.waitForTimeout(waitMs);
  await clickLivePrimaryButton(page, /结束这一轮/);

  await page.waitForFunction((count) => {
    return document.body.innerText.includes(`已记录 ${count} 轮 live 对话`);
  }, expectedTurnCount, { timeout: 35000 });

  await waitForLivePrimaryButton(page, /开始这一轮|已连上，点一下就能开始这一轮/);
}

async function clickLivePrimaryButton(page, namePattern) {
  const button = getLivePrimaryButton(page, namePattern);
  await button.waitFor({ timeout: 25000 });
  await button.click();
}

async function waitForLivePrimaryButton(page, namePattern) {
  await getLivePrimaryButton(page, namePattern).waitFor({ timeout: 25000 });
}

function getLivePrimaryButton(page, namePattern) {
  return page.locator('button').filter({
    hasText: namePattern,
  }).first();
}

async function fetchJson(page, path) {
  return page.evaluate(async (relativePath) => {
    const response = await fetch(relativePath, { cache: 'no-store' });
    return response.json();
  }, path);
}

async function readReviewCard(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="live-session-review-card"]');
    const headline = document.querySelector('[data-testid="live-session-review-headline"]')?.textContent?.trim() || '';
    const sourceCountText = document
      .querySelector('[data-testid="live-session-review-source-count"]')
      ?.textContent?.trim() || '';
    const summary = document.querySelector('[data-testid="live-session-review-summary"]')?.textContent?.trim() || '';
    const reviewText = document.querySelector('[data-testid="live-session-review-text"]')?.textContent?.trim() || '';
    const match = sourceCountText.match(/基于\s+(\d+)\s+条对话消息生成/);

    return {
      sourceMessageCount: match ? Number(match[1]) : null,
      headline,
      summary,
      reviewText,
      cardText: card?.textContent?.trim() || '',
    };
  });
}

async function readDiagnosticsFromPage(page) {
  const diagnosticsFromWindow = await page.evaluate(() => {
    return window.__geminiLiveDiagnostics || null;
  }).catch(() => null);

  if (diagnosticsFromWindow && diagnosticsFromWindow.schemaVersion === 1 && Array.isArray(diagnosticsFromWindow.timeline)) {
    return diagnosticsFromWindow;
  }

  throw new Error('Failed to find structured Live diagnostics in page');
}

async function waitForReviewResponse(getResponse, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = getResponse();
    if (current) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for review-summary response');
}

function buildFallbackReviewCard(reviewResponse) {
  const data = reviewResponse?.data;
  return {
    sourceMessageCount: Number(data?.sourceMessageCount || 0) || null,
    headline: data?.headline || '',
    summary: data?.summary || '',
    reviewText: data?.reviewText || '',
    cardText: [data?.headline, data?.summary, data?.reviewText].filter(Boolean).join(' '),
  };
}

function truncateFrame(payload) {
  if (typeof payload !== 'string') {
    return '<binary>';
  }

  return payload.length > 240 ? `${payload.slice(0, 240)}...` : payload;
}

function buildFixtureAudio() {
  const turnTexts = parseTurnTexts();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speakonimage-live-review-'));
  const turns = turnTexts.map((text, index) => synthesizeTurnAudio(text, index, tempDir));
  return { tempDir, turns };
}

function parseTurnTexts() {
  const jsonInput = process.env.TEST_AUDIO_TEXTS_JSON;
  if (jsonInput) {
    try {
      const parsed = JSON.parse(jsonInput);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string' && item.trim())) {
        return parsed.map((item) => item.trim());
      }
    } catch (error) {
      throw new Error(`Failed to parse TEST_AUDIO_TEXTS_JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const listInput = process.env.TEST_AUDIO_TEXTS;
  if (listInput) {
    const parsed = listInput
      .split(/\n---+\n|\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return DEFAULT_TURN_TEXTS;
}

function synthesizeTurnAudio(text, index, tempDir) {
  const aiffPath = path.join(tempDir, `turn-${index + 1}.aiff`);
  const wavPath = path.join(tempDir, `turn-${index + 1}.wav`);

  execFileSync('/usr/bin/say', ['-v', TEST_AUDIO_VOICE, '-r', String(TEST_AUDIO_RATE), '-o', aiffPath, text], {
    stdio: 'pipe',
  });
  execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiffPath, wavPath], {
    stdio: 'pipe',
  });

  const wavBuffer = fs.readFileSync(wavPath);
  const pcmBuffer = extractPcmFromWav(wavBuffer);
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const durationMs = Math.round((sampleCount / 16000) * 1000);

  return {
    index: index + 1,
    text,
    pcmBase64: pcmBuffer.toString('base64'),
    sampleCount,
    durationMs,
  };
}

function extractPcmFromWav(wavBuffer) {
  if (wavBuffer.toString('ascii', 0, 4) !== 'RIFF' || wavBuffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Expected a PCM WAVE file');
  }

  let offset = 12;
  let fmt = null;
  let dataOffset = null;
  let dataSize = null;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: wavBuffer.readUInt16LE(chunkDataOffset),
        channelCount: wavBuffer.readUInt16LE(chunkDataOffset + 2),
        sampleRate: wavBuffer.readUInt32LE(chunkDataOffset + 4),
        bitsPerSample: wavBuffer.readUInt16LE(chunkDataOffset + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset === null || dataSize === null) {
    throw new Error('Failed to find fmt/data chunks in WAVE file');
  }

  if (fmt.audioFormat !== 1 || fmt.channelCount !== 1 || fmt.sampleRate !== 16000 || fmt.bitsPerSample !== 16) {
    throw new Error(
      `Unexpected WAVE format: format=${fmt.audioFormat} channels=${fmt.channelCount} rate=${fmt.sampleRate} bits=${fmt.bitsPerSample}`
    );
  }

  return wavBuffer.subarray(dataOffset, dataOffset + dataSize);
}

function cleanupFixtureAudio(tempDir) {
  if (!tempDir) {
    return;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
}

function buildQualityChecks({ fixtureAudio, reviewResponse, reviewCard, sessionMessages }) {
  const liveMessages = Array.isArray(sessionMessages?.data?.messages)
    ? sessionMessages.data.messages.filter((message) => message?.metadata?.source === 'live_coach')
    : [];
  const userMessages = liveMessages.filter((message) => message.role === 'user');
  const userTranscript = userMessages.map((message) => String(message.content || '')).join(' ').toLowerCase();
  const reviewText = [
    reviewCard?.headline || '',
    reviewCard?.summary || '',
    reviewCard?.reviewText || '',
    ...(Array.isArray(reviewResponse?.data?.goodPhrases) ? reviewResponse.data.goodPhrases : []),
  ].join(' ').toLowerCase();
  const expectedKeywords = extractKeywords(fixtureAudio.turns.map((turn) => turn.text).join(' '));
  const transcriptKeywordHits = expectedKeywords.filter((keyword) => userTranscript.includes(keyword));
  const reviewKeywordHits = expectedKeywords.filter((keyword) => reviewText.includes(keyword));
  const checks = [
    {
      name: 'source_message_count',
      pass: Number(reviewCard?.sourceMessageCount) >= fixtureAudio.turns.length * 2,
      detail: `sourceMessageCount=${reviewCard?.sourceMessageCount ?? 'n/a'}`,
    },
    {
      name: 'english_user_transcript',
      pass: userMessages.length >= fixtureAudio.turns.length && userMessages.every((message) => /[a-z]{3,}/i.test(String(message.content || ''))),
      detail: userMessages.map((message) => message.content).join(' | ') || '<none>',
    },
    {
      name: 'transcript_keyword_overlap',
      pass: transcriptKeywordHits.length >= 4,
      detail: transcriptKeywordHits.join(', ') || '<none>',
    },
    {
      name: 'review_mentions_topic',
      pass: reviewKeywordHits.length >= 2 || /(英语|口语|练习|反馈|学习者|产品|应用)/.test(reviewText),
      detail: reviewKeywordHits.join(', ') || '<none>',
    },
    {
      name: 'good_phrases_not_placeholder',
      pass: !/(暂无|没有|未提取|无直接提取)/.test(
        Array.isArray(reviewResponse?.data?.goodPhrases) ? reviewResponse.data.goodPhrases.join(' ') : ''
      ),
      detail: Array.isArray(reviewResponse?.data?.goodPhrases) ? reviewResponse.data.goodPhrases.join(' | ') : '<none>',
    },
  ];

  return {
    passed: checks.filter((item) => item.pass),
    failed: checks.filter((item) => !item.pass),
  };
}

function extractKeywords(text) {
  const keywords = [];

  for (const rawWord of String(text).split(/[^a-zA-Z]+/)) {
    const word = normalizeKeyword(rawWord);
    if (!word || STOPWORDS.has(word) || keywords.includes(word)) {
      continue;
    }
    keywords.push(word);
  }

  return keywords;
}

function normalizeKeyword(word) {
  const normalized = String(word || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/(ing|ers|ies|ied|ed|es|s)$/g, '');

  return normalized.length >= 4 ? normalized : '';
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
