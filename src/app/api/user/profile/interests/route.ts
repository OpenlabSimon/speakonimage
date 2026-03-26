import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applyInterestFeedback, getPersistedProfileSignals } from '@/lib/profile/memory';
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';
import type { ApiResponse } from '@/types';

const RequestSchema = z.object({
  interests: z.array(z.string().min(1).max(80)).max(8),
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

    const updatedProfile = applyInterestFeedback(speaker.languageProfile, parsed.data.interests);

    await prisma.speaker.update({
      where: { id: speaker.id },
      data: {
        languageProfile: updatedProfile as object,
        lastActiveAt: new Date(),
      },
    });

    const recomputedProfile = await computeAndUpdateProfile(speaker.id);
    const signals = getPersistedProfileSignals(recomputedProfile);

    return NextResponse.json<ApiResponse<{ interests: string[] }>>({
      success: true,
      data: {
        interests: signals.interests.map((item) => item.label),
      },
    });
  } catch (error) {
    console.error('Update profile interests error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to update interests: ${message}` },
      { status: 500 }
    );
  }
}
