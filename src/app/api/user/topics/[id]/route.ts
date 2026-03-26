import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import type { ApiResponse } from '@/types';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;

    const topic = await prisma.topic.findFirst({
      where: {
        id,
        accountId: authResult.user.id,
      },
      select: {
        id: true,
        type: true,
        originalInput: true,
        topicContent: true,
        difficultyMetadata: true,
        submissions: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            attemptNumber: true,
            transcribedText: true,
            rawAudioUrl: true,
            createdAt: true,
            difficultyAssessment: true,
          },
        },
      },
    });

    if (!topic) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      );
    }

    const topicContent =
      topic.topicContent && typeof topic.topicContent === 'object' && !Array.isArray(topic.topicContent)
        ? topic.topicContent
        : {};

    return NextResponse.json<ApiResponse<Record<string, unknown>>>({
      success: true,
      data: {
        id: topic.id,
        type: topic.type,
        originalInput: topic.originalInput,
        ...topicContent,
        difficultyMetadata: topic.difficultyMetadata,
        attempts: topic.submissions.map((submission) => ({
          attemptNumber: submission.attemptNumber,
          text: submission.transcribedText,
          audioUrl: submission.rawAudioUrl ?? undefined,
          timestamp: submission.createdAt.toISOString(),
          overallScore:
            (submission.difficultyAssessment as { overallScore?: number } | null)?.overallScore ?? 0,
        })),
      },
    });
  } catch (error) {
    console.error('Get user topic error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get topic: ${message}` },
      { status: 500 }
    );
  }
}
