import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST } from '@/app/api/coach/review-audio/route';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/coach/review-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach/review-audio', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.GEMINI_TTS_API_KEY;
    delete process.env.GEMINI_TTS_MODEL;
    delete process.env.COACH_REVIEW_TTS_PROVIDER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.REVIEW_AUDIO_SIGNING_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.AZURE_SPEECH_KEY = 'azure-test-key';
    process.env.AZURE_SPEECH_REGION = 'westus3';
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)),
    });
  });

  it('generates Azure coach audio on demand', async () => {
    const response = await POST(makeRequest({
      teacher: {
        soulId: 'gentle',
      },
      review: {
        mode: 'all',
        autoPlayAudio: true,
      },
      speechScript: 'This is a quick teacher review.',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('generated');
    expect(data.data.provider).toBe('azure');
    expect(data.data.audioUrl).toContain('data:audio/mpeg;base64,');
  });

  it('skips audio when review mode does not require it', async () => {
    const response = await POST(makeRequest({
      teacher: {
        soulId: 'gentle',
      },
      review: {
        mode: 'text',
        autoPlayAudio: true,
      },
      speechScript: 'This is a quick teacher review.',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('skipped');
  });
});
