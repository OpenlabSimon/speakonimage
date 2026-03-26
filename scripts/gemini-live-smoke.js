#!/usr/bin/env node

const apiKey =
  process.env.GEMINI_OFFICIAL_API_KEY ||
  process.env.GOOGLE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;
const apiBaseUrl = (process.env.GEMINI_LIVE_API_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const wsUrlOverride = process.env.GEMINI_LIVE_WS_URL;
const model =
  process.env.GEMINI_LIVE_MODEL ||
  'gemini-2.5-flash-native-audio-preview-12-2025';
const voiceName = process.env.GEMINI_LIVE_VOICE_NAME || 'Puck';
const audioMimeType = 'audio/pcm;rate=16000';

if (!apiKey) {
  console.error('Missing GEMINI_OFFICIAL_API_KEY, GOOGLE_GEMINI_API_KEY, or GEMINI_API_KEY');
  process.exit(1);
}

if (typeof WebSocket === 'undefined') {
  console.error('Global WebSocket is not available in this Node runtime');
  process.exit(1);
}

async function createEphemeralToken() {
  let response;
  const tokenEndpoint = `${apiBaseUrl}/v1alpha/auth_tokens`;
  try {
    response = await fetch(
      `${tokenEndpoint}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uses: 1 }),
      }
    );
  } catch (error) {
    throw new Error(`token_request_failed: ${tokenEndpoint}: ${formatError(error)}`);
  }

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`token_http_failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return json.name;
}

async function main() {
  console.log(`api_base_url=${apiBaseUrl}`);
  console.log(`model=${model}`);
  console.log(`voice=${voiceName}`);
  const tokenName = await createEphemeralToken();
  console.log(`token=${tokenName}`);

  const wsUrl =
    `${wsUrlOverride || 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'}?access_token=${encodeURIComponent(tokenName)}`;

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('timeout waiting for Gemini Live response'));
    }, 15000);

    socket.addEventListener('open', () => {
      console.log('socket=open');
      socket.send(JSON.stringify({
        setup: {
          model: model.startsWith('models/') ? model : `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: true,
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }));
    });

    socket.addEventListener('message', async (event) => {
      const raw = await normalizeMessageData(event.data);
      console.log(`message=${raw}`);

      if (!raw.trim()) {
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (parsed.setupComplete) {
          socket.send(JSON.stringify({
            realtimeInput: {
              activityStart: {},
            },
          }));

          const audioChunks = createPcmAudioChunks();
          for (const chunk of audioChunks) {
            socket.send(JSON.stringify({
              realtimeInput: {
                audio: {
                  mimeType: audioMimeType,
                  data: chunk,
                },
              },
            }));
          }

          socket.send(JSON.stringify({
            realtimeInput: {
              activityEnd: {},
            },
          }));
          return;
        }

        const modelTurn = parsed.serverContent?.modelTurn;
        const turnComplete = parsed.serverContent?.turnComplete;
        const generationComplete = parsed.serverContent?.generationComplete;

        if (modelTurn || turnComplete || generationComplete) {
          clearTimeout(timeout);
          socket.close(1000, 'done');
          resolve(null);
        }
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });

    socket.addEventListener('error', (event) => {
      clearTimeout(timeout);
      reject(new Error(`websocket_error: ${JSON.stringify(event)}`));
    });

    socket.addEventListener('close', (event) => {
      console.log(`socket=close code=${event.code} reason=${event.reason}`);
    });
  });
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [error.message];
  const cause = error.cause;

  if (cause && typeof cause === 'object') {
    if (typeof cause.code === 'string') {
      details.push(`code=${cause.code}`);
    }
    if (typeof cause.message === 'string') {
      details.push(cause.message);
    }
    if (typeof cause.host === 'string') {
      details.push(`host=${cause.host}`);
    }
    if (typeof cause.port === 'number' || typeof cause.port === 'string') {
      details.push(`port=${cause.port}`);
    }
  }

  return details.join(' | ');
}

async function normalizeMessageData(data) {
  if (typeof data === 'string') {
    return data;
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer()).toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  return '';
}

function createPcmAudioChunks() {
  return [330, 440, 550].map((frequencyHz) => createPcmChunkBase64(frequencyHz));
}

function createPcmChunkBase64(frequencyHz) {
  const sampleRate = 16000;
  const durationMs = 220;
  const sampleCount = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((index * 2 * Math.PI * frequencyHz) / sampleRate);
    const pcm = Math.max(-1, Math.min(1, sample * 0.18));
    buffer.writeInt16LE(Math.round(pcm * 32767), index * 2);
  }

  return buffer.toString('base64');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
