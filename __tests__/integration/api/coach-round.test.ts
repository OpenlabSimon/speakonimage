import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationEval from '../../mocks/fixtures/evaluation-translation.json';
import expressionEval from '../../mocks/fixtures/evaluation-expression.json';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
  auth: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));
vi.mock('@/lib/memory/ConversationManager', () => ({
  getOrCreateSessionForTopic: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
}));
vi.mock('@/lib/profile/ProfileInjector', () => ({
  buildProfileContext: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/coach/round/route';

const translationTopicContent = {
  chinesePrompt: '昨天我在咖啡店遇到了朋友',
  keyPoints: ['Meeting at coffee shop', 'Yesterday'],
  suggestedVocab: [
    { word: 'run into', phonetic: '/rʌn/', partOfSpeech: 'phrasal verb', chinese: '偶遇', exampleContext: 'I ran into a friend.' },
  ],
  difficultyMetadata: {
    targetCefr: 'B1',
    vocabComplexity: 2,
    grammarComplexity: 2,
  },
};

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/coach/round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach/round', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    resetLLMMock();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)),
    });
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.GEMINI_TTS_API_KEY;
    delete process.env.GEMINI_TTS_MODEL;
    delete process.env.COACH_REVIEW_TTS_PROVIDER;
    process.env.AZURE_SPEECH_KEY = 'azure-test-key';
    process.env.AZURE_SPEECH_REGION = 'westus3';
  });

  it('returns practiceMode and skillDomain for translation text rounds', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      historyAttempts: [
        {
          text: 'I meet a friend in coffee shop yesterday.',
          score: 72,
        },
      ],
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.practiceMode).toBe('translation_text');
    expect(data.data.skillDomain).toBe('translation');
    expect(data.data.teacher).toEqual({ soulId: 'default' });
    expect(data.data.review).toEqual({ mode: 'all', autoPlayAudio: true });
    expect(typeof data.data.reviewText).toBe('string');
    expect(typeof data.data.speechScript).toBe('string');
    expect(typeof data.data.ttsText).toBe('string');
    expect(data.data.reviewText.length).toBeGreaterThan(20);
    expect(data.data.speechScript.length).toBeGreaterThan(20);
    expect(data.data.ttsText.length).toBeGreaterThan(20);
    expect(data.data.reviewText).not.toContain('得分');
    expect(data.data.speechScript).not.toContain('这次得分是');
    expect(data.data.speechScript).toBe(data.data.ttsText);
    expect(data.data.audioReview.enabled).toBe(true);
    expect(data.data.audioReview.provider).toBe('azure');
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.voiceId).toBe('en-US-AvaMultilingualNeural');
    expect(data.data.audioReview.text).toBe(data.data.speechScript);
    expect(data.data.htmlArtifact.enabled).toBe(true);
    expect(data.data.htmlArtifact.status).toBe('generated');
    expect(data.data.sameTopicProgress).toMatchObject({
      attemptCount: 2,
      deltaFromLast: data.data.overallScore - 72,
    });
    expect(data.data.difficultySignal).toEqual({
      targetCefr: 'B1',
      baselineCefr: 'B1',
      relation: 'matched',
    });
    expect(data.data.submissionId).toBeUndefined();
  });

  it('persists and returns session metadata for authenticated rounds', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(expressionEval);
    prismaMock.topic.findUnique.mockResolvedValue({ id: 'topic-1', accountId: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({
      id: 'speaker-1',
      languageProfile: {
        coachMemory: {
          longTermReminders: [
            {
              id: 'long-1',
              scope: 'long_term',
              text: '持续注意冠词 a/an 的使用。',
              source: 'goal',
              createdAt: new Date().toISOString(),
              relatedPatterns: ['articles'],
            },
          ],
          currentRoundReminders: [
            {
              id: 'round-1',
              scope: 'current_round',
              text: '这轮最关键的是把过去时说稳。',
              source: 'coach_review',
              createdAt: new Date().toISOString(),
              relatedPatterns: ['past-tense'],
            },
          ],
        },
      },
    });
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.submission.create.mockResolvedValue({ id: 'sub-1' });
    prismaMock.grammarError.createMany.mockResolvedValue({ count: 0 });
    prismaMock.vocabularyUsage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.speaker.update.mockResolvedValue({});

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
      topicType: 'expression',
      topicContent: {
        chinesePrompt: '描述你的旅行经历',
        guidingQuestions: ['你去了哪里?'],
        suggestedVocab: [
          { word: 'explore', phonetic: '/ɪkˈsplɔːr/', partOfSpeech: 'verb', chinese: '探索', exampleContext: 'test' },
        ],
        grammarHints: [{ point: 'Past tense', explanation: '用过去式', pattern: 'S+V-ed', example: 'I visited...' }],
      },
      userResponse: 'I traveled to Japan last year and it was amazing.',
      inputMethod: 'voice',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.submissionId).toBe('sub-1');
    expect(data.data.sessionId).toBe('session-1');
    expect(data.data.practiceMode).toBe('expression_voice');
    expect(data.data.skillDomain).toBe('spoken_expression');
    expect(data.data.reviewText).toContain('先复盘长期提醒');
    expect(data.data.reviewText).toContain('回到这一轮');
    expect(data.data.reviewText).toContain('现在最值得马上再练一次的是');
    expect(data.data.speechScript).not.toContain('这次得分是');
    expect(data.data.speechScript).toContain('持续注意冠词 a/an 的使用');
    expect(data.data.speechScript).toContain('下一次你先这样练');
    expect(data.data.review).toEqual({ mode: 'all', autoPlayAudio: true });
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.provider).toBe('azure');
    expect(data.data.htmlArtifact.status).toBe('generated');
  });

  it('accepts explicit teacher soul and review mode preferences', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)),
    });

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      teacher: {
        soulId: 'humorous',
        voiceId: 'elevenlabs-voice-1',
      },
      review: {
        mode: 'all',
        autoPlayAudio: true,
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.teacher).toEqual({
      soulId: 'humorous',
      voiceId: 'elevenlabs-voice-1',
    });
    expect(data.data.review).toEqual({
      mode: 'all',
      autoPlayAudio: true,
    });
    expect(data.data.reviewText).toContain('槽点');
    expect(data.data.speechScript).toContain('槽点');
    expect(data.data.audioReview.enabled).toBe(true);
    expect(data.data.audioReview.provider).toBe('azure');
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.voiceId).toBe('elevenlabs-voice-1');
    expect(data.data.audioReview.text).toBe(data.data.speechScript);
    expect(data.data.audioReview.audioUrl).toBeUndefined();
    expect(data.data.audioReview.format).toBeUndefined();
    expect(data.data.htmlArtifact.enabled).toBe(true);
    expect(data.data.htmlArtifact.status).toBe('generated');
    expect(data.data.htmlArtifact.title).toContain('Coach Review');
    expect(data.data.htmlArtifact.html).toContain('<!DOCTYPE html>');
    expect(data.data.htmlArtifact.html).toContain('本轮老师复盘');
  });

  it('still returns pending Azure audio when ElevenLabs credentials exist', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)),
    });

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      review: {
        mode: 'all',
        autoPlayAudio: true,
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.provider).toBe('azure');
    expect(data.data.audioReview.audioUrl).toBeUndefined();
  });

  it('returns pending Gemini audio metadata when configured', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);
    process.env.GEMINI_TTS_API_KEY = 'google-test-key';
    process.env.GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
    process.env.COACH_REVIEW_TTS_PROVIDER = 'gemini';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/L16;codec=pcm;rate=24000',
                    data: Buffer.from(new Uint8Array(32)).toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      teacher: {
        soulId: 'energetic',
      },
      review: {
        mode: 'audio',
        autoPlayAudio: false,
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.audioReview.provider).toBe('gemini');
    expect(data.data.audioReview.voiceId).toBe('Fenrir');
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.audioUrl).toBeUndefined();
    expect(data.data.audioReview.format).toBeUndefined();
  });

  it('generates html artifact for html-only review mode without audio', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      review: {
        mode: 'html',
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.audioReview.status).toBe('skipped');
    expect(data.data.htmlArtifact.status).toBe('generated');
    expect(data.data.htmlArtifact.html).toContain('English Coach Lesson Artifact');
  });

  it('requires auth when persisting to a saved topic', async () => {
    setUnauthenticated();

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });
});
