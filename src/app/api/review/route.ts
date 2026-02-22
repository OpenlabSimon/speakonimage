import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDueItems, recordReview } from '@/lib/spaced-repetition/ReviewScheduler';
import type { ApiResponse } from '@/types';

const RecordReviewSchema = z.object({
  itemId: z.string().uuid(),
  rating: z.number().int().min(1).max(4),
});

/**
 * GET /api/review — returns due items + stats
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
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No speaker found' },
        { status: 404 }
      );
    }

    const items = await getDueItems(speaker.id);

    return NextResponse.json<ApiResponse<typeof items>>({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('Review GET error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to load review items: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/review — record a review { itemId, rating }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = RecordReviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { itemId, rating } = parsed.data;

    // Verify the item belongs to the user's speaker
    const item = await prisma.reviewItem.findUnique({
      where: { id: itemId },
      include: { speaker: { select: { accountId: true } } },
    });

    if (!item || item.speaker.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Review item not found' },
        { status: 404 }
      );
    }

    const updated = await recordReview(itemId, rating as 1 | 2 | 3 | 4);

    return NextResponse.json<ApiResponse<typeof updated>>({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Review POST error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to record review: ${message}` },
      { status: 500 }
    );
  }
}
