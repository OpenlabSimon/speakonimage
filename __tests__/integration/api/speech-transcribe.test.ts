import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/speech/transcribe/route';

describe('/api/speech/transcribe', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reports transcription availability for the current environment', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      available: false,
      provider: null,
      reason: '当前环境未配置语音转写。请直接输入文字，或进入 Live 对话。',
    });
  });

  it('returns a friendly 503 when transcription is unavailable', async () => {
    const formData = new FormData();
    formData.append('audio', new File(['audio'], 'sample.wav', { type: 'audio/wav' }));

    const request = new NextRequest('http://localhost/api/speech/transcribe', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error).toBe('当前环境未配置语音转写。请直接输入文字，或进入 Live 对话。');
  });
});
