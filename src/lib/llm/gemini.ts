import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { LLMProvider, LLMConfig, LLMError, withRetry } from './provider';

// Extended config for proxy support
export interface GeminiConfig extends LLMConfig {
  baseUrl?: string;
}

/**
 * Gemini provider using OpenAI-compatible proxy API
 * Supports hiapi.online and similar proxy services
 */
export class GeminiProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private maxRetries: number;
  private temperature: number;

  readonly name = 'Gemini';

  constructor(config: GeminiConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://hiapi.online/v1',
    });
    this.model = config.model || 'gemini-3-pro-preview';
    this.maxRetries = config.maxRetries ?? 1;
    this.temperature = config.temperature ?? 0.7;
  }

  async generateJSON<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T> {
    return withRetry(async () => {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push({
        role: 'user',
        content: prompt + '\n\nRespond with valid JSON only, no markdown formatting.',
      });

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '';

      // Parse JSON from response
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonData = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new LLMError(
            `Failed to parse JSON response: ${text.substring(0, 200)}...`,
            this.name,
            parseError as Error
          );
        }
      }

      // Validate with Zod schema
      const validated = schema.safeParse(jsonData);
      if (!validated.success) {
        throw new LLMError(
          `Schema validation failed: ${validated.error.message}`,
          this.name
        );
      }

      return validated.data;
    }, this.maxRetries);
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: this.temperature,
    });

    return completion.choices[0]?.message?.content || '';
  }
}
