import { NextResponse } from 'next/server';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getReviewStats } from '@/lib/spaced-repetition/ReviewScheduler';
import type { ApiResponse } from '@/types';

/**
 * GET /api/review/stats — lightweight endpoint for home page badge
 */
export async function GET() {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const speaker = await prisma.speaker.findFirst({
      where: { accountId: authResult.user.id },
      select: { id: true },
    });

    if (!speaker) {
      return NextResponse.json<ApiResponse<{ dueCount: number; nextReviewAt: string | null }>>({
        success: true,
        data: { dueCount: 0, nextReviewAt: null },
      });
    }

    const stats = await getReviewStats(speaker.id);

    return NextResponse.json<ApiResponse<{
      dueCount: number;
      totalItems: number;
      nextReviewAt: string | null;
    }>>({
      success: true,
      data: {
        dueCount: stats.dueCount,
        totalItems: stats.totalItems,
        nextReviewAt: stats.nextReviewAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Review stats error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to load review stats: ${message}` },
      { status: 500 }
    );
  }
}
