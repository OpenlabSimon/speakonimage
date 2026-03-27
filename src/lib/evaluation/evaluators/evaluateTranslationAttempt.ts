import { getLLMProvider } from '@/lib/llm';
import { resolveEvaluationModel } from '@/lib/llm/model-selection';
import {
  TranslationEvaluationSchema,
  buildTranslationEvaluationPrompt,
  getTranslationEvaluationSystemPrompt,
} from '@/lib/llm/prompts/evaluate-translation';
import type { EvaluateParams, EvaluationOutput } from './types';

export async function evaluateTranslationAttempt(
  params: EvaluateParams
): Promise<EvaluationOutput> {
  const llm = getLLMProvider('critical');
  const vocabWords = params.suggestedVocab.map((v) => v.word);

  const prompt = buildTranslationEvaluationPrompt(
    params.chinesePrompt,
    params.keyPoints || [],
    params.userResponse,
    vocabWords,
    params.historyAttempts,
    // Translation tasks use profile context for expression quality hints,
    // but must not be treated as speaking assessment.
    params.profileContext || undefined,
    params.inputMethod
  );

  return llm.generateJSON(
    prompt,
    TranslationEvaluationSchema,
    getTranslationEvaluationSystemPrompt(params.inputMethod),
    { model: resolveEvaluationModel() }
  );
}
