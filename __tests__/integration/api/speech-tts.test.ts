import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST } from '@/app/api/speech/tts/route';
import { NextRequest } from 'next/server';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/speech/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/speech/tts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'westus3';
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
  });

  it('returns audio for Azure TTS', async () => {
    const audioBuffer = new ArrayBuffer(100);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBuffer),
    });

    const response = await POST(makeRequest({
      text: 'Hello world',
      provider: 'azure',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.audio).toBeDefined();
    expect(data.data.format).toBe('mp3');
    expect(data.data.provider).toBe('azure');
  });

  it('returns audio for ElevenLabs TTS', async () => {
    const audioBuffer = new ArrayBuffer(100);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBuffer),
    });

    const response = await POST(makeRequest({
      text: 'Hello world',
      provider: 'elevenlabs',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.provider).toBe('elevenlabs');
  });

  it('returns 400 for missing text', async () => {
    const response = await POST(makeRequest({ text: '' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Text is required');
  });

  it('returns 400 for text too long', async () => {
    const response = await POST(makeRequest({
      text: 'a'.repeat(1001),
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('too long');
  });

  it('returns 500 when Azure key is missing', async () => {
    delete process.env.AZURE_SPEECH_KEY;

    const response = await POST(makeRequest({
      text: 'Hello',
      provider: 'azure',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
