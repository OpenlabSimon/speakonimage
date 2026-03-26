import { ZodSchema } from 'zod';
import { LLMProvider, LLMConfig, LLMCallOptions, LLMError, withRetry } from './provider';

type GeminiOfficialConfig = LLMConfig;

interface GeminiOfficialPart {
  text?: string;
}

interface GeminiOfficialCandidate {
  content?: {
    parts?: GeminiOfficialPart[];
  };
}

interface GeminiOfficialResponse {
  candidates?: GeminiOfficialCandidate[];
  error?: {
    message?: string;
  };
}

export class GeminiOfficialProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private maxRetries: number;
  private temperature: number;
  private timeoutMs: number;

  readonly name = 'GeminiOfficial';

  constructor(config: GeminiOfficialConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.5-flash';
    this.maxRetries = config.maxRetries ?? 1;
    this.temperature = config.temperature ?? 0.7;
    this.timeoutMs = config.timeoutMs ?? 45000;
  }

  async generateJSON<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string,
    options?: LLMCallOptions
  ): Promise<T> {
    return withRetry(async () => {
      const text = await this.requestText(
        prompt,
        systemPrompt,
        options?.model || this.model,
        'application/json'
      );

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
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

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    return this.requestText(prompt, systemPrompt, options?.model || this.model);
  }

  private async requestText(
    prompt: string,
    systemPrompt?: string,
    model?: string,
    responseMimeType?: string
  ): Promise<string> {
    console.info(`[LLM official] request model=${model || this.model}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    let json: GeminiOfficialResponse;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: systemPrompt
              ? {
                  parts: [{ text: systemPrompt }],
                }
              : undefined,
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: this.temperature,
              ...(responseMimeType ? { responseMimeType } : {}),
            },
          }),
          signal: controller.signal,
        }
      );
      json = (await response.json()) as GeminiOfficialResponse;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LLMError(
          `LLM request timed out after ${Math.round(this.timeoutMs / 1000)}s`,
          this.name,
          error as Error
        );
      }
      throw new LLMError('Official Gemini request failed', this.name, error as Error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new LLMError(
        `Official Gemini failed: ${response.status} - ${json.error?.message || 'Unknown error'}`,
        this.name
      );
    }

    const text = json.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new LLMError('Official Gemini returned empty content', this.name);
    }

    console.info(`[LLM official] success model=${model || this.model}`);

    return text;
  }
}
