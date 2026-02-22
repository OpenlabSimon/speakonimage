import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { evaluateResponse, getProfileContext, persistSubmission } from '@/lib/evaluation/evaluateSubmission';
import type { ApiResponse } from '@/types';

// Request body schema
const SubmissionRequestSchema = z.object({
  topicId: z.string().uuid().optional(), // Topic ID from database
  sessionId: z.string().uuid().optional(), // Chat session ID for memory
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

    const { topicId, sessionId, topicType, topicContent, userResponse, inputMethod, historyAttempts } = parsed.data;

    // Check authentication
    const authResult = await checkAuth();

    // If topicId is provided, require authentication and validate ownership
    if (topicId) {
      if (!authResult.authenticated) {
        return unauthorizedResponse('Authentication required to submit to a saved topic');
      }

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

    // Build profile context for personalized feedback
    const profileContext = authResult.authenticated
      ? await getProfileContext(authResult.user.id)
      : null;

    // Evaluate
    const { evaluation, overallScore } = await evaluateResponse({
      topicType,
      chinesePrompt: topicContent.chinesePrompt,
      keyPoints: topicContent.keyPoints,
      guidingQuestions: topicContent.guidingQuestions,
      suggestedVocab: topicContent.suggestedVocab,
      grammarHints: topicContent.grammarHints,
      userResponse,
      inputMethod,
      historyAttempts,
      profileContext,
    });

    // Persist to database if authenticated
    let submissionId: string | undefined;
    let activeSessionId: string | undefined = sessionId;

    if (authResult.authenticated && topicId) {
      const result = await persistSubmission({
        topicId,
        accountId: authResult.user.id,
        inputMethod,
        userResponse,
        evaluation,
        overallScore,
        topicType,
        suggestedVocab: topicContent.suggestedVocab,
        sessionId,
      });
      submissionId = result.submissionId;
      activeSessionId = result.sessionId;
    }

    return NextResponse.json<ApiResponse<{
      id?: string;
      sessionId?: string;
      evaluation: typeof evaluation;
      overallScore: number;
      inputMethod: string;
    }>>({
      success: true,
      data: {
        id: submissionId,
        sessionId: activeSessionId,
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
