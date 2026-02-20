import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLLMProvider } from '@/lib/llm';
import {
  TranslationEvaluationSchema,
  TRANSLATION_EVALUATION_SYSTEM_PROMPT,
  buildTranslationEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-translation';
import {
  ExpressionEvaluationSchema,
  EXPRESSION_EVALUATION_SYSTEM_PROMPT,
  buildExpressionEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-expression';
import type { ApiResponse, VocabularyItem, GrammarHint } from '@/types';

// Request body schema
const SubmissionRequestSchema = z.object({
  topicType: z.enum(['translation', 'expression']),
  topicContent: z.object({
    chinesePrompt: z.string(),
    keyPoints: z.array(z.string()).optional(),
    guidingQuestions: z.array(z.string()).optional(),
    suggestedVocab: z.array(z.object({
      word: z.string(),
      phonetic: z.string(),
      partOfSpeech: z.string(),
      chinese: z.string(),
      exampleContext: z.string(),
    })),
    grammarHints: z.array(z.object({
      point: z.string(),
      explanation: z.string(),
      pattern: z.string(),
      example: z.string(),
    })).optional(),
  }),
  userResponse: z.string().min(1),
  inputMethod: z.enum(['voice', 'text']),
  historyAttempts: z.array(z.object({
    text: z.string(),
    score: z.number(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SubmissionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { topicType, topicContent, userResponse, inputMethod, historyAttempts } = parsed.data;

    // Get LLM provider
    const llm = getLLMProvider();

    // Extract vocab words for prompt
    const vocabWords = topicContent.suggestedVocab.map(v => v.word);

    let evaluation;

    if (topicType === 'translation') {
      // Build translation evaluation prompt
      const prompt = buildTranslationEvaluationPrompt(
        topicContent.chinesePrompt,
        topicContent.keyPoints || [],
        userResponse,
        vocabWords,
        historyAttempts
      );

      evaluation = await llm.generateJSON(
        prompt,
        TranslationEvaluationSchema,
        TRANSLATION_EVALUATION_SYSTEM_PROMPT
      );
    } else {
      // Build expression evaluation prompt
      const grammarPoints = topicContent.grammarHints?.map(g => g.point) || [];
      const prompt = buildExpressionEvaluationPrompt(
        topicContent.chinesePrompt,
        topicContent.guidingQuestions || [],
        userResponse,
        vocabWords,
        grammarPoints,
        historyAttempts
      );

      evaluation = await llm.generateJSON(
        prompt,
        ExpressionEvaluationSchema,
        EXPRESSION_EVALUATION_SYSTEM_PROMPT
      );
    }

    // Calculate overall score for response
    let overallScore: number;
    if (evaluation.type === 'translation') {
      overallScore = Math.round(
        (evaluation.semanticAccuracy.score * 0.4 +
          evaluation.naturalness.score * 0.2 +
          evaluation.grammar.score * 0.2 +
          evaluation.vocabulary.score * 0.2)
      );
    } else {
      overallScore = Math.round(
        (evaluation.relevance.score * 0.25 +
          evaluation.depth.score * 0.25 +
          evaluation.creativity.score * 0.25 +
          evaluation.languageQuality.score * 0.25)
      );
    }

    return NextResponse.json<ApiResponse<{
      evaluation: typeof evaluation;
      overallScore: number;
      inputMethod: string;
    }>>({
      success: true,
      data: {
        evaluation,
        overallScore,
        inputMethod,
      },
    });
  } catch (error) {
    console.error('Submission evaluation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Evaluation failed: ${message}` },
      { status: 500 }
    );
  }
}
