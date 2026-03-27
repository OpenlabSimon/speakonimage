import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applyRecommendationFeedback } from '@/lib/profile/memory';
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';
import type { ApiResponse } from '@/types';

const RequestSchema = z.object({
  recommendationId: z.string().min(1),
  recommendationKind: z.enum(['topic', 'vocabulary', 'example']),
  recommendationTitle: z.string().min(1).max(200),
  sentiment: z.enum(['helpful', 'too_easy', 'too_hard', 'good_direction_not_now', 'off_topic']),
  relatedInterestKeys: z.array(z.string()).max(4).default([]),
});

export async function PATCH(request: NextRequest) {
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const speaker = await prisma.speaker.findFirst({
      where: { accountId: authResult.user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, languageProfile: true },
    });

    if (!speaker) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No speaker found' },
        { status: 404 }
      );
    }

    const updatedProfile = applyRecommendationFeedback(speaker.languageProfile, parsed.data);

    await prisma.speaker.update({
      where: { id: speaker.id },
      data: {
        languageProfile: updatedProfile as object,
        lastActiveAt: new Date(),
      },
    });

    const recomputedProfile = await computeAndUpdateProfile(speaker.id);

    return NextResponse.json<ApiResponse<{
      recommendationFeedback: typeof recomputedProfile.recommendationFeedback;
    }>>({
      success: true,
      data: {
        recommendationFeedback: recomputedProfile.recommendationFeedback,
      },
    });
  } catch (error) {
    console.error('Update recommendation feedback error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to update recommendation feedback: ${message}` },
      { status: 500 }
    );
  }
}
