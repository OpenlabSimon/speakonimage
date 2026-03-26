import { z } from 'zod';
import { getGeminiLiveApiBaseUrl } from './gemini-live';
import { cleanEnvValue, readCleanEnvValue } from '@/lib/env-utils';

const GeminiLiveTokenResponseSchema = z.object({
  name: z.string().min(1),
  expireTime: z.string().optional(),
});

export type GeminiLiveTokenResponse = z.infer<typeof GeminiLiveTokenResponseSchema>;

let proxyAgentCache: { proxyUrl: string; dispatcher: unknown } | null = null;

export function getGeminiLiveProxyUrl(): string | null {
  const proxyUrl = readCleanEnvValue(
    'GEMINI_LIVE_PROXY_URL',
    'https_proxy',
    'HTTPS_PROXY',
    'http_proxy',
    'HTTP_PROXY'
  );

  return proxyUrl || null;
}

export async function createGeminiEphemeralToken(options?: {
  apiKey?: string;
  uses?: number;
}): Promise<GeminiLiveTokenResponse> {
  const apiKey = cleanEnvValue(options?.apiKey)
    || readCleanEnvValue('GEMINI_OFFICIAL_API_KEY', 'GOOGLE_GEMINI_API_KEY', 'GEMINI_API_KEY');

  if (!apiKey) {
    throw new Error('GEMINI_OFFICIAL_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    uses: options?.uses ?? 1,
  };

  const tokenEndpoint = `${getGeminiLiveApiBaseUrl()}/v1alpha/auth_tokens`;
  const requestInit: RequestInit & { dispatcher?: unknown } = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  const proxyUrl = getGeminiLiveProxyUrl();
  if (proxyUrl) {
    requestInit.dispatcher = await getGeminiLiveProxyDispatcher(proxyUrl);
  }

  let response: Response;
  try {
    response = await fetch(`${tokenEndpoint}?key=${encodeURIComponent(apiKey)}`, requestInit);
  } catch (error) {
    throw new Error(formatGeminiLiveNetworkError(tokenEndpoint, error));
  }

  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json
        ? JSON.stringify((json as { error?: unknown }).error)
        : text || 'Unknown error';
    throw new Error(`Gemini Live token failed: ${response.status} - ${message}`);
  }

  return GeminiLiveTokenResponseSchema.parse(json);
}

async function getGeminiLiveProxyDispatcher(proxyUrl: string): Promise<unknown> {
  if (proxyAgentCache?.proxyUrl === proxyUrl) {
    return proxyAgentCache.dispatcher;
  }

  const { ProxyAgent } = await import('undici');
  const dispatcher = new ProxyAgent(proxyUrl);
  proxyAgentCache = { proxyUrl, dispatcher };
  return dispatcher;
}

function formatGeminiLiveNetworkError(endpoint: string, error: unknown): string {
  if (!(error instanceof Error)) {
    return `Gemini Live token request failed for ${endpoint}: ${String(error)}`;
  }

  const details = [error.message];
  const cause = readCauseDetails(error.cause);

  if (cause.code) {
    details.push(`code=${cause.code}`);
  }
  if (cause.message) {
    details.push(cause.message);
  }
  if (cause.host) {
    details.push(`host=${cause.host}`);
  }
  if (cause.port) {
    details.push(`port=${cause.port}`);
  }

  return `Gemini Live token request failed for ${endpoint}: ${details.join(' | ')}`;
}

function readCauseDetails(cause: unknown): {
  code?: string;
  message?: string;
  host?: string;
  port?: string;
} {
  if (!cause || typeof cause !== 'object') {
    return {};
  }

  const message = typeof (cause as { message?: unknown }).message === 'string'
    ? (cause as { message: string }).message
    : undefined;
  const code = typeof (cause as { code?: unknown }).code === 'string'
    ? (cause as { code: string }).code
    : undefined;
  const host = typeof (cause as { host?: unknown }).host === 'string'
    ? (cause as { host: string }).host
    : undefined;
  const portValue = (cause as { port?: unknown }).port;
  const port = typeof portValue === 'number' || typeof portValue === 'string'
    ? String(portValue)
    : undefined;

  return { code, message, host, port };
}
