import { z, ZodSchema } from 'zod';

// LLM Provider interface - provider-agnostic
export interface LLMProvider {
  /**
   * Generate structured JSON output with schema validation
   * @param prompt User prompt
   * @param schema Zod schema for validation
   * @param systemPrompt Optional system prompt
   * @returns Validated JSON object
   */
  generateJSON<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T>;

  /**
   * Generate plain text response
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Text response
   */
  generateText(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Provider name for identification
   */
  readonly name: string;
}

// Provider configuration
export interface LLMConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  temperature?: number;
}

// Error class for LLM failures
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// Retry helper for JSON parsing failures
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`LLM attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries) break;
    }
  }

  throw lastError;
}
