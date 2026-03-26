import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';
import { GeminiOfficialProvider } from './gemini-official';
import { FallbackLLMProvider } from './fallback';
import { normalizeOpenAICompatibleBaseUrl, readCleanEnvValue } from '@/lib/env-utils';

export type LLMUsageMode = 'critical' | 'background';

function createHiapiProvider(): LLMProvider | null {
  const geminiKey = readCleanEnvValue('GEMINI_API_KEY');
  if (!geminiKey) {
    return null;
  }

  const baseUrl = normalizeOpenAICompatibleBaseUrl(process.env.GEMINI_BASE_URL);
  const model = readCleanEnvValue('GEMINI_MODEL');
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || '90000');

  return new GeminiProvider({
    apiKey: geminiKey,
    baseUrl,
    model: model || 'gemini-3-pro-preview',
    temperature: 0.7,
    maxRetries: 1,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 90000,
  });
}

function createOfficialProvider(): LLMProvider | null {
  const apiKey = readCleanEnvValue(
    'GEMINI_OFFICIAL_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'GEMINI_TTS_API_KEY'
  );

  if (!apiKey) {
    return null;
  }

  const model = readCleanEnvValue('GEMINI_OFFICIAL_MODEL', 'GEMINI_MODEL') || 'gemini-2.5-flash';
  const timeoutMs = Number(process.env.GEMINI_OFFICIAL_TIMEOUT_MS || '45000');

  return new GeminiOfficialProvider({
    apiKey,
    model,
    temperature: 0.7,
    maxRetries: 1,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 45000,
  });
}

function composeProviders(primary: LLMProvider | null, fallback: LLMProvider | null): LLMProvider | null {
  if (primary && fallback) {
    return new FallbackLLMProvider(primary, fallback);
  }

  return primary || fallback;
}

// Get LLM provider based on environment configuration
export function getLLMProvider(mode: LLMUsageMode = 'background'): LLMProvider {
  const officialProvider = createOfficialProvider();
  const hiapiProvider = createHiapiProvider();

  const provider = mode === 'critical'
    ? composeProviders(officialProvider, hiapiProvider)
    : composeProviders(hiapiProvider, officialProvider);

  if (provider) {
    return provider;
  }

  throw new Error(
    'No LLM provider configured. Set GEMINI_API_KEY or GEMINI_OFFICIAL_API_KEY environment variable.'
  );
}

// Re-export types and utilities
export type { LLMProvider } from './provider';
export { LLMError, withRetry } from './provider';
export { GeminiProvider } from './gemini';
export { GeminiOfficialProvider } from './gemini-official';
