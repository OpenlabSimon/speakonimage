import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { getSession, getMessages } from '@/lib/memory/ConversationManager';
import { extractSessionLearningData } from '@/lib/memory/SessionExtractor';
import { buildSessionReview } from '@/domains/teachers/session-review';
import type { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SessionReviewRequestSchema = z.object({
  teacher: z.object({
    soulId: z.enum(['default', 'gentle', 'strict', 'humorous', 'scholarly', 'energetic']).optional(),
    voiceId: z.string().min(1).optional(),
  }).optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id: sessionId } = await params;
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = SessionReviewRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const teacher = {
      soulId: parsed.data.teacher?.soulId || 'default',
      voiceId: parsed.data.teacher?.voiceId,
    };

    const allMessages = await getMessages(sessionId);
    const liveMessages = allMessages.filter((message) => message.metadata?.source === 'live_coach');
    const reviewMessages = (liveMessages.length >= 2 ? liveMessages : allMessages)
      .filter((message) => message.role !== 'system');

    if (reviewMessages.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No conversation messages available for review' },
        { status: 400 }
      );
    }

    const canReuseStoredExtraction =
      liveMessages.length === 0 &&
      session.status === 'ended' &&
      !!session.extractedData;

    const extraction = canReuseStoredExtraction
      ? session.extractedData!
      : await extractSessionLearningData(reviewMessages, session);

    const summary = await buildSessionReview({
      teacher,
      session,
      messages: reviewMessages,
      extraction,
    });

    return NextResponse.json<ApiResponse<typeof summary>>({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Session review summary error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to generate session review: ${message}` },
      { status: 500 }
    );
  }
}
