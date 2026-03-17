import { getLLMProvider } from '@/lib/llm';
import {
  ExpressionEvaluationSchema,
  buildExpressionEvaluationPrompt,
  getExpressionEvaluationSystemPrompt,
} from '@/lib/llm/prompts/evaluate-expression';
import type { EvaluateParams, EvaluationOutput } from './types';

export async function evaluateWrittenExpressionAttempt(
  params: EvaluateParams
): Promise<EvaluationOutput> {
  const llm = getLLMProvider();
  const vocabWords = params.suggestedVocab.map((v) => v.word);
  const grammarPoints = params.grammarHints?.map((g) => g.point) || [];

  const prompt = buildExpressionEvaluationPrompt(
    params.chinesePrompt,
    params.guidingQuestions || [],
    params.userResponse,
    vocabWords,
    grammarPoints,
    params.historyAttempts,
    params.profileContext || undefined,
    'text'
  );

  return llm.generateJSON(
    prompt,
    ExpressionEvaluationSchema,
    getExpressionEvaluationSystemPrompt('text')
  );
}
