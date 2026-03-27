interface GeminiTTSOptions {
  apiKey: string;
  model?: string;
  voiceName: string;
  prompt: string;
}

interface GeminiTTSInlineData {
  mimeType?: string;
  data?: string;
}

interface GeminiTTSPart {
  inlineData?: GeminiTTSInlineData;
}

interface GeminiTTSCandidate {
  content?: {
    parts?: GeminiTTSPart[];
  };
}

interface GeminiTTSResponse {
  candidates?: GeminiTTSCandidate[];
  error?: {
    message?: string;
  };
}

export interface GeminiTTSAudio {
  audioBuffer: ArrayBuffer;
  contentType: 'audio/wav';
  format: 'wav';
}

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export async function synthesizeWithGeminiTTS(options: GeminiTTSOptions): Promise<GeminiTTSAudio> {
  const { apiKey, model = DEFAULT_GEMINI_TTS_MODEL, voiceName, prompt } = options;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
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
      }),
    }
  );

  const json = (await response.json()) as GeminiTTSResponse;

  if (!response.ok) {
    throw new Error(`Gemini TTS failed: ${response.status} - ${json.error?.message || 'Unknown error'}`);
  }

  const inlineData = json.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .find((part) => part.inlineData?.data)
    ?.inlineData;

  if (!inlineData?.data) {
    throw new Error('Gemini TTS failed: audio payload missing');
  }

  const pcmBytes = Uint8Array.from(Buffer.from(inlineData.data, 'base64'));
  const sampleRate = extractSampleRate(inlineData.mimeType);
  const wavBytes = wrapPcmAsWav(pcmBytes, sampleRate);

  return {
    audioBuffer: wavBytes.slice().buffer,
    contentType: 'audio/wav',
    format: 'wav',
  };
}

function extractSampleRate(mimeType?: string): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function wrapPcmAsWav(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  const bitsPerSample = 16;
  const channels = 1;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcmData.byteLength, true);
  bytes.set(pcmData, 44);

  return bytes;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
