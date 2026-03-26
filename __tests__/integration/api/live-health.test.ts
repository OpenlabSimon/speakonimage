import { beforeEach, describe, expect, it, vi } from 'vitest';

const createGeminiEphemeralTokenMock = vi.fn();
const isGeminiLiveEnabledMock = vi.fn(() => true);

vi.mock('@/lib/live/gemini-live', () => ({
  isGeminiLiveEnabled: () => isGeminiLiveEnabledMock(),
  getGeminiLiveModel: () => 'gemini-2.5-flash-native-audio-preview-12-2025',
}));

vi.mock('@/lib/live/gemini-live-server', () => ({
  createGeminiEphemeralToken: (...args: unknown[]) => createGeminiEphemeralTokenMock(...args),
}));

import { GET } from '@/app/api/live/health/route';
import { NextRequest } from 'next/server';

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/live/health', () => {
  beforeEach(() => {
    createGeminiEphemeralTokenMock.mockReset();
    isGeminiLiveEnabledMock.mockReturnValue(true);
  });

  it('returns configured stage without probing', async () => {
    const response = await GET(makeRequest('http://localhost/api/live/health'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.stage).toBe('configured');
  });

  it('returns token_ok when probe succeeds', async () => {
    createGeminiEphemeralTokenMock.mockResolvedValue({
      name: 'auth_tokens/ok',
      expireTime: '2026-03-23T12:00:00Z',
    });

    const response = await GET(makeRequest('http://localhost/api/live/health?probe=1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.stage).toBe('token_ok');
    expect(data.data.tokenName).toBe('auth_tokens/ok');
  });

  it('returns classified token_failed when probe fails', async () => {
    createGeminiEphemeralTokenMock.mockRejectedValue(new Error('fetch failed'));

    const response = await GET(makeRequest('http://localhost/api/live/health?probe=1'));
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.data.stage).toBe('token_failed');
    expect(data.data.errorCode).toBe('network');
  });
});
