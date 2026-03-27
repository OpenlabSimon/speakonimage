import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGeminiLiveApiBaseUrl, getGeminiLiveWsUrl } from '@/lib/live/gemini-live';
import { createGeminiEphemeralToken, getGeminiLiveProxyUrl } from '@/lib/live/gemini-live-server';

describe('gemini-live', () => {
  const originalApiBaseUrl = process.env.GEMINI_LIVE_API_BASE_URL;
  const originalProxyUrl = process.env.GEMINI_LIVE_PROXY_URL;
  const originalWsUrl = process.env.GEMINI_LIVE_WS_URL;
  const originalOfficialApiKey = process.env.GEMINI_OFFICIAL_API_KEY;
  const originalHttpProxy = process.env.http_proxy;
  const originalHttpsProxy = process.env.https_proxy;
  const originalUpperHttpProxy = process.env.HTTP_PROXY;
  const originalUpperHttpsProxy = process.env.HTTPS_PROXY;

  afterEach(() => {
    process.env.GEMINI_LIVE_API_BASE_URL = originalApiBaseUrl;
    process.env.GEMINI_LIVE_PROXY_URL = originalProxyUrl;
    process.env.GEMINI_LIVE_WS_URL = originalWsUrl;
    process.env.GEMINI_OFFICIAL_API_KEY = originalOfficialApiKey;
    process.env.http_proxy = originalHttpProxy;
    process.env.https_proxy = originalHttpsProxy;
    process.env.HTTP_PROXY = originalUpperHttpProxy;
    process.env.HTTPS_PROXY = originalUpperHttpsProxy;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses configured Gemini Live API and WebSocket endpoints', async () => {
    process.env.GEMINI_LIVE_API_BASE_URL = 'https://relay.example.com///';
    process.env.GEMINI_LIVE_WS_URL = 'wss://relay.example.com/live';
    process.env.GEMINI_OFFICIAL_API_KEY = 'test-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ name: 'auth_tokens/test-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(getGeminiLiveApiBaseUrl()).toBe('https://relay.example.com');
    expect(getGeminiLiveWsUrl()).toBe('wss://relay.example.com/live');

    const token = await createGeminiEphemeralToken();

    expect(token.name).toBe('auth_tokens/test-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1alpha/auth_tokens?key=test-secret',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('reads explicit Gemini Live proxy override', () => {
    process.env.GEMINI_LIVE_PROXY_URL = 'http://127.0.0.1:7897';

    expect(getGeminiLiveProxyUrl()).toBe('http://127.0.0.1:7897');
  });

  it('surfaces low-level network cause details without leaking the API key', async () => {
    process.env.GEMINI_LIVE_API_BASE_URL = 'https://generativelanguage.googleapis.com';
    process.env.GEMINI_OFFICIAL_API_KEY = 'super-secret-key';
    delete process.env.GEMINI_LIVE_PROXY_URL;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;

    const networkCause = Object.assign(
      new Error('Client network socket disconnected before secure TLS connection was established'),
      {
        code: 'ECONNRESET',
        host: 'generativelanguage.googleapis.com',
        port: 443,
      }
    );
    const fetchError = new TypeError('fetch failed');
    Object.assign(fetchError, { cause: networkCause });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));

    let thrown: Error | undefined;
    try {
      await createGeminiEphemeralToken();
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain('Gemini Live token request failed for https://generativelanguage.googleapis.com/v1alpha/auth_tokens');
    expect(thrown?.message).toContain('fetch failed');
    expect(thrown?.message).toContain('code=ECONNRESET');
    expect(thrown?.message).toContain('host=generativelanguage.googleapis.com');
    expect(thrown?.message).toContain('port=443');
    expect(thrown?.message).not.toContain('super-secret-key');
  });
});
