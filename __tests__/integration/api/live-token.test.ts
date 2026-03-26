import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createGeminiEphemeralTokenMock = vi.fn();
const isGeminiLiveEnabledMock = vi.fn(() => true);

vi.mock('@/lib/live/gemini-live', () => ({
  isGeminiLiveEnabled: () => isGeminiLiveEnabledMock(),
  getGeminiLiveModel: () => 'gemini-2.5-flash-native-audio-preview-12-2025',
  getGeminiLiveWsUrl: () => 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
}));

vi.mock('@/lib/live/gemini-live-server', () => ({
  createGeminiEphemeralToken: (...args: unknown[]) => createGeminiEphemeralTokenMock(...args),
}));

import { POST } from '@/app/api/live/token/route';

function makeRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost/api/live/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

describe('POST /api/live/token', () => {
  beforeEach(() => {
    createGeminiEphemeralTokenMock.mockReset();
    isGeminiLiveEnabledMock.mockReturnValue(true);
  });

  it('returns a Gemini Live token payload', async () => {
    createGeminiEphemeralTokenMock.mockResolvedValue({
      name: 'auth_tokens/test-token',
      expireTime: '2026-03-23T12:00:00Z',
    });

    const response = await POST(makeRequest({ uses: 1, expireTimeSeconds: 60 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.provider).toBe('gemini-live');
    expect(data.data.tokenName).toBe('auth_tokens/test-token');
    expect(data.data.model).toBe('gemini-2.5-flash-native-audio-preview-12-2025');
    expect(data.data.wsUrl).toBe(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'
    );
  });

  it('rejects invalid request payload', async () => {
    const response = await POST(makeRequest({ uses: 99 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 503 when Gemini Live is disabled', async () => {
    isGeminiLiveEnabledMock.mockReturnValue(false);

    const response = await POST(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error).toContain('disabled');
  });
});
