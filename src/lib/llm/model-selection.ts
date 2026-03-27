import { readCleanEnvValue } from '@/lib/env-utils';

function readEnvModel(...keys: string[]): string | undefined {
  return readCleanEnvValue(...keys);
}

export function resolveFastLLMModel(): string {
  return readEnvModel('GEMINI_FLASH_MODEL', 'FAST_LLM_MODEL') || 'gemini-2.5-flash';
}

export function resolveBackgroundLLMModel(): string {
  return readEnvModel('BACKGROUND_LLM_MODEL', 'GEMINI_BACKGROUND_MODEL', 'GEMINI_FLASH_LITE_MODEL')
    || 'gemini-2.5-flash-lite';
}

export function resolveTopicGenerationModel(): string {
  return readEnvModel('TOPIC_GENERATION_MODEL', 'GEMINI_FLASH_MODEL', 'FAST_LLM_MODEL')
    || 'gemini-2.5-flash';
}

export function resolveEvaluationModel(): string {
  return readEnvModel('EVALUATION_MODEL', 'GEMINI_FLASH_MODEL', 'FAST_LLM_MODEL')
    || 'gemini-2.5-flash';
}
