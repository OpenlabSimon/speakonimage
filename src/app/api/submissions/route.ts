import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
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
import type { ApiResponse } from '@/types';

// Request body schema
const SubmissionRequestSchema = z.object({
  topicId: z.string().uuid().optional(), // Topic ID from database
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

    const { topicId, topicType, topicContent, userResponse, inputMethod, historyAttempts } = parsed.data;

    // Check authentication
    const authResult = await checkAuth();

    // If topicId is provided, require authentication and validate ownership
    if (topicId) {
      if (!authResult.authenticated) {
        return unauthorizedResponse('Authentication required to submit to a saved topic');
      }

      // Verify the topic belongs to this user
      const topic = await prisma.topic.findUnique({
        where: { id: topicId },
        select: { accountId: true },
      });

      if (!topic) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Topic not found' },
          { status: 404 }
        );
      }

      if (topic.accountId !== authResult.user.id) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'You do not have permission to submit to this topic' },
          { status: 403 }
        );
      }
    }

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

    // Save to database if user is authenticated and we have a topicId
    let submissionId: string | undefined;
    if (authResult.authenticated && topicId) {
      // Get attempt number (count previous submissions for this topic)
      const previousAttempts = await prisma.submission.count({
        where: {
          topicId,
          accountId: authResult.user.id,
        },
      });

      // Get default speaker for this user
      const speaker = await prisma.speaker.findFirst({
        where: { accountId: authResult.user.id },
        orderBy: { createdAt: 'asc' },
      });

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          topicId,
          accountId: authResult.user.id,
          speakerId: speaker?.id,
          attemptNumber: previousAttempts + 1,
          inputMethod,
          transcribedText: userResponse,
          evaluation: evaluation as object,
          difficultyAssessment: {
            overallScore,
            estimatedCefr: evaluation.overallCefrEstimate,
          },
        },
      });

      submissionId = submission.id;

      // Extract and save grammar errors
      const grammarErrors = evaluation.type === 'translation'
        ? evaluation.grammar.errors
        : evaluation.languageQuality.grammarErrors;

      if (grammarErrors && grammarErrors.length > 0) {
        await prisma.grammarError.createMany({
          data: grammarErrors.map(error => ({
            submissionId: submission.id,
            speakerId: speaker?.id,
            errorPattern: error.rule,
            originalText: error.original,
            correctedText: error.corrected,
            severity: error.severity,
          })),
        });
      }

      // Extract and save vocabulary usage (words from suggested vocab that were used)
      const usedVocabWords = topicContent.suggestedVocab.filter(vocab =>
        userResponse.toLowerCase().includes(vocab.word.toLowerCase())
      );

      if (usedVocabWords.length > 0) {
        await prisma.vocabularyUsage.createMany({
          data: usedVocabWords.map(vocab => ({
            submissionId: submission.id,
            speakerId: speaker?.id,
            word: vocab.word,
            wasFromHint: true,
            usedCorrectly: true, // Simplified - could be enhanced with LLM check
            cefrLevel: evaluation.overallCefrEstimate,
          })),
        });
      }

      // Update speaker's last active time
      if (speaker) {
        await prisma.speaker.update({
          where: { id: speaker.id },
          data: { lastActiveAt: new Date() },
        });
      }
    }

    return NextResponse.json<ApiResponse<{
      id?: string;
      evaluation: typeof evaluation;
      overallScore: number;
      inputMethod: string;
    }>>({
      success: true,
      data: {
        id: submissionId,
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
