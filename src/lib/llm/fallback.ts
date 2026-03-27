import { ZodSchema } from 'zod';
import { LLMProvider, LLMCallOptions } from './provider';

export class FallbackLLMProvider implements LLMProvider {
  readonly name: string;
  lastResolvedProviderName: string | null = null;

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallback: LLMProvider
  ) {
    this.name = `${primary.name}->${fallback.name}`;
  }

  async generateJSON<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string,
    options?: LLMCallOptions
  ): Promise<T> {
    try {
      const result = await this.primary.generateJSON(prompt, schema, systemPrompt, options);
      this.lastResolvedProviderName = this.primary.name;
      return result;
    } catch (error) {
      console.warn(`[LLM fallback] ${this.primary.name} failed, falling back to ${this.fallback.name}`, error);
      const result = await this.fallback.generateJSON(prompt, schema, systemPrompt, options);
      this.lastResolvedProviderName = this.fallback.name;
      return result;
    }
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    try {
      const result = await this.primary.generateText(prompt, systemPrompt, options);
      this.lastResolvedProviderName = this.primary.name;
      return result;
    } catch (error) {
      console.warn(`[LLM fallback] ${this.primary.name} failed, falling back to ${this.fallback.name}`, error);
      const result = await this.fallback.generateText(prompt, systemPrompt, options);
      this.lastResolvedProviderName = this.fallback.name;
      return result;
    }
  }
}

export function getResolvedLLMProviderName(provider: LLMProvider): string {
  if (
    'lastResolvedProviderName' in provider &&
    typeof provider.lastResolvedProviderName === 'string' &&
    provider.lastResolvedProviderName
  ) {
    return provider.lastResolvedProviderName;
  }

  return provider.name;
}
