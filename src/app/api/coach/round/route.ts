import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { runCoachingRound } from '@/domains/runtime/round-orchestrator';
import type { ApiResponse } from '@/types';

const CoachingRoundRequestSchema = z.object({
  topicId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
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
  inputMethod: z.enum(['text', 'voice']),
  teacher: z.object({
    soulId: z.enum(['default', 'gentle', 'strict', 'humorous', 'scholarly', 'energetic']).optional(),
    voiceId: z.string().min(1).optional(),
  }).optional(),
  review: z.object({
    mode: z.enum(['text', 'audio', 'html', 'all']).optional(),
    autoPlayAudio: z.boolean().optional(),
  }).optional(),
  historyAttempts: z.array(z.object({
    text: z.string(),
    score: z.number(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CoachingRoundRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const {
      topicId,
      sessionId,
      topicType,
      topicContent,
      userResponse,
      inputMethod,
      teacher,
      review,
      historyAttempts,
    } = parsed.data;
    const authResult = await checkAuth();

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
      teacher,
      review,
      historyAttempts,
      persistence: {
        topicId,
        sessionId,
      },
    });

    return NextResponse.json<ApiResponse<typeof round>>({
      success: true,
      data: round,
    });
  } catch (error) {
    console.error('Coach round error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Coach round failed: ${message}` },
      { status: 500 }
    );
  }
}
