import { LLMProvider } from './provider';
import { GeminiProvider } from './gemini';

// Get LLM provider based on environment configuration
export function getLLMProvider(): LLMProvider {
  const geminiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.GEMINI_BASE_URL;
  const model = process.env.GEMINI_MODEL;

  if (geminiKey) {
    return new GeminiProvider({
      apiKey: geminiKey,
      baseUrl: baseUrl || 'https://hiapi.online/v1',
      model: model || 'gemini-3-pro-preview',
      temperature: 0.7,
      maxRetries: 1,
    });
  }

  throw new Error(
    'No LLM provider configured. Set GEMINI_API_KEY environment variable.'
  );
}

// Re-export types and utilities
export type { LLMProvider } from './provider';
export { LLMError, withRetry } from './provider';
export { GeminiProvider } from './gemini';
