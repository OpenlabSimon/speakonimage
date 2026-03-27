import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, parseJsonResponse } from '@/lib/http/parse-json-response';

describe('parseJsonResponse', () => {
  it('parses valid json payloads', async () => {
    const response = new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const parsed = await parseJsonResponse<{ success: boolean; data: { ok: boolean } }>(response);

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.success).toBe(true);
    expect(parsed.data?.data.ok).toBe(true);
    expect(parsed.errorText).toBeNull();
  });

  it('captures non-json response text for user-facing fallback', async () => {
    const response = new Response('Request Entity Too Large', {
      status: 413,
      headers: { 'Content-Type': 'text/plain' },
    });

    const parsed = await parseJsonResponse(response);

    expect(parsed.ok).toBe(false);
    expect(parsed.data).toBeNull();
    expect(parsed.errorText).toBe('Request Entity Too Large');
    expect(getApiErrorMessage(parsed, 'fallback')).toBe('Request Entity Too Large');
  });
});
