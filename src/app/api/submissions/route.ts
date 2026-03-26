import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { runCoachingRound } from '@/domains/runtime/round-orchestrator';
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

    const round = await runCoachingRound({
      auth: authResult.authenticated
        ? { authenticated: true, userId: authResult.user.id }
        : { authenticated: false },
      topicType,
      topicContent,
      userResponse,
      inputMethod,
      historyAttempts,
      persistence: {
        topicId,
        sessionId,
      },
      deferAudioReview: true,
    });

    return NextResponse.json<ApiResponse<{
      id?: string;
      sessionId?: string;
      evaluation: typeof round.evaluation;
      overallScore: number;
      inputMethod: string;
    }>>({
      success: true,
      data: {
        id: round.submissionId,
        sessionId: round.sessionId,
        evaluation: round.evaluation,
        overallScore: round.overallScore,
        inputMethod: round.inputMethod,
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
