#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'https://www.dopling.ai';
const INVITE_COOKIE = process.env.INVITE_COOKIE || 'friend-1-8e6b0ba5f241a2a0';
const OUTPUT_PATH = process.env.OUTPUT_PATH || '';
const host = new URL(BASE_URL).hostname;
const cookieDomain = host.endsWith('dopling.ai') ? '.dopling.ai' : host;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: 'speakonimage_invite',
      value: INVITE_COOKIE,
      domain: cookieDomain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  const consoleLines = [];
  const webSocketFrames = [];

  page.on('console', (message) => {
    consoleLines.push(`${message.type()}: ${message.text()}`);
  });

  page.on('websocket', (ws) => {
    const url = ws.url();
    if (!url.includes('BidiGenerateContentConstrained')) {
      return;
    }

    webSocketFrames.push(`ws-open: ${url}`);
    ws.on('framesent', (event) => {
      webSocketFrames.push(`sent: ${truncateFrame(event.payload)}`);
    });
    ws.on('framereceived', (event) => {
      webSocketFrames.push(`received: ${truncateFrame(event.payload)}`);
    });
    ws.on('close', () => {
      webSocketFrames.push('ws-close');
    });
  });

  await page.addInitScript(() => {
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
        let tick = 0;
        this.intervalId = setInterval(() => {
          tick += 1;
          const chunk = new Float32Array(1024);
          for (let index = 0; index < chunk.length; index += 1) {
            chunk[index] = Math.sin((index + tick * 32) / 18) * 0.18;
          }

          processor.onaudioprocess?.({
            inputBuffer: {
              getChannelData: () => chunk,
            },
          });

          if (tick >= 12) {
            clearInterval(this.intervalId);
          }
        }, 140);
      }
      disconnect() {
        if (this.intervalId) {
          clearInterval(this.intervalId);
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

    window.localStorage.setItem(
      'currentTopic',
      JSON.stringify({
        type: 'expression',
        chinesePrompt: 'Talk briefly about a project you are building.',
        suggestedVocab: [],
        grammarHints: [],
        difficultyMetadata: {
          targetCefr: 'B1',
          vocabComplexity: 0,
          grammarComplexity: 0,
        },
      })
    );
  });

  await page.goto(`${BASE_URL}/topic/practice`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=实时口语教练 Beta', { timeout: 20000 });
  await page.getByRole('button', { name: '实时口语教练 Beta' }).click();
  await page.waitForSelector('text=Gemini Live Beta', { timeout: 10000 });
  await page.getByRole('button', { name: '连接 Live' }).click();
  let captureStatus = 'complete';
  const startButton = page.getByRole('button', { name: '开始这一轮' });
  const stopButton = page.getByRole('button', { name: '结束这一轮' });

  try {
    await startButton.waitFor({ timeout: 10000 });
    await startButton.click();
    await stopButton.waitFor({ timeout: 10000 });
    await page.waitForTimeout(3500);

    const stopEnabled = await stopButton.isEnabled();
    console.log(`stop_enabled=${stopEnabled}`);
    if (stopEnabled) {
      await stopButton.click();
    }

    try {
      await page.waitForFunction(() => {
        const preNodes = Array.from(document.querySelectorAll('pre'));
        for (const pre of preNodes) {
          try {
            const parsed = JSON.parse(pre.textContent || '{}');
            const timeline = Array.isArray(parsed.timeline) ? parsed.timeline : [];
            return timeline.some((entry) =>
              entry?.name === 'turn_complete' || entry?.name === 'fallback_requested'
            );
          } catch {
            // ignore
          }
        }
        return false;
      }, { timeout: 25000 });
    } catch {
      captureStatus = 'timeout_waiting_for_terminal_event';
    }
  } catch {
    captureStatus = 'connect_failed_before_start';
    await page.waitForTimeout(1500);
  }

  const diagnostics = await readDiagnosticsFromPage(page).catch(() => null);
  const summary = summarizeDiagnostics(diagnostics);
  summary.captureStatus = captureStatus;
  const bodyText = await page.locator('body').innerText();

  if (OUTPUT_PATH && diagnostics) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(diagnostics, null, 2));
  }

  console.log('=== summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('=== diagnostics ===');
  console.log(JSON.stringify(diagnostics, null, 2));
  console.log('=== page ===');
  console.log(bodyText);
  console.log('=== console ===');
  console.log(consoleLines.join('\n'));
  console.log('=== ws ===');
  console.log(webSocketFrames.join('\n'));

  await browser.close();
}

async function readDiagnosticsFromPage(page) {
  const diagnosticsFromWindow = await page.evaluate(() => {
    return window.__geminiLiveDiagnostics || null;
  }).catch(() => null);

  if (diagnosticsFromWindow && diagnosticsFromWindow.schemaVersion === 1 && Array.isArray(diagnosticsFromWindow.timeline)) {
    return diagnosticsFromWindow;
  }

  const preNodes = page.locator('pre');
  const count = await preNodes.count();

  for (let index = count - 1; index >= 0; index -= 1) {
    const text = await preNodes.nth(index).innerText();
    const parsed = tryParseJson(text);
    if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.timeline)) {
      return parsed;
    }
  }

  throw new Error('Failed to find structured Live diagnostics in page');
}

function summarizeDiagnostics(diagnostics) {
  if (!diagnostics) {
    return {
      sessionId: null,
      currentState: null,
      fallbackActive: false,
      route: null,
      error: null,
      timings: {},
      audioStats: {},
      timelineNames: [],
    };
  }

  return {
    sessionId: diagnostics.sessionId,
    currentState: diagnostics.currentState,
    fallbackActive: diagnostics.fallbackActive,
    route: diagnostics.route,
    error: diagnostics.error || null,
    timings: diagnostics.timings || {},
    audioStats: diagnostics.audioStats || {},
    timelineNames: Array.isArray(diagnostics.timeline)
      ? diagnostics.timeline.map((entry) => entry.name)
      : [],
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function truncateFrame(payload) {
  const text = typeof payload === 'string' ? payload : String(payload);
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
