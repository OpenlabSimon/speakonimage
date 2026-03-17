import type { InputMethod, PracticeMode, SkillDomain, TopicType } from '@/types';
import type { TranslationEvaluationOutput } from '@/lib/llm/prompts/evaluate-translation';
import type { ExpressionEvaluationOutput } from '@/lib/llm/prompts/evaluate-expression';

export type EvaluationOutput = TranslationEvaluationOutput | ExpressionEvaluationOutput;

export interface EvaluateParams {
  topicType: TopicType;
  chinesePrompt: string;
  keyPoints?: string[];
  guidingQuestions?: string[];
  suggestedVocab: { word: string }[];
  grammarHints?: { point: string }[];
  userResponse: string;
  inputMethod: InputMethod;
  historyAttempts?: { text: string; score: number }[];
  profileContext?: string | null;
}

export interface EvaluateResult {
  evaluation: EvaluationOutput;
  overallScore: number;
  practiceMode: PracticeMode;
  skillDomain: SkillDomain;
}

export function getPracticeMode(
  topicType: TopicType,
  inputMethod: InputMethod
): PracticeMode {
  if (topicType === 'translation') {
    return inputMethod === 'voice' ? 'translation_voice' : 'translation_text';
  }

  return inputMethod === 'voice' ? 'expression_voice' : 'expression_text';
}

export function getSkillDomain(practiceMode: PracticeMode): SkillDomain {
  switch (practiceMode) {
    case 'translation_text':
    case 'translation_voice':
      return 'translation';
    case 'expression_text':
      return 'written_expression';
    case 'expression_voice':
      return 'spoken_expression';
  }
}

export function calculateOverallScore(evaluation: EvaluationOutput): number {
  if (evaluation.type === 'translation') {
    return Math.round(
      evaluation.semanticAccuracy.score * 0.4 +
      evaluation.naturalness.score * 0.2 +
      evaluation.grammar.score * 0.2 +
      evaluation.vocabulary.score * 0.2
    );
  }

  return Math.round(
    evaluation.relevance.score * 0.25 +
    evaluation.depth.score * 0.25 +
    evaluation.creativity.score * 0.25 +
    evaluation.languageQuality.score * 0.25
  );
}
