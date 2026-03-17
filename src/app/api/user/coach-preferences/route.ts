import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  mergeCoachPreferencesIntoSettings,
  readCoachPreferencesFromSettings,
} from '@/lib/user/coach-preferences';
import type { ApiResponse } from '@/types';

const CoachPreferencesSchema = z.object({
  reviewMode: z.enum(['text', 'audio', 'html', 'all']).optional(),
  autoPlayAudio: z.boolean().optional(),
  characterId: z.enum(['thornberry', 'mei', 'ryan']).optional(),
  voiceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{20}$/, 'voiceId must be a 20-character alphanumeric ElevenLabs voice ID')
    .or(z.literal(''))
    .optional(),
});

export async function GET() {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const account = await prisma.account.findUnique({
      where: { id: authResult.user.id },
      select: { settings: true },
    });

    if (!account) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<ReturnType<typeof readCoachPreferencesFromSettings>>>({
      success: true,
      data: readCoachPreferencesFromSettings(account.settings),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to load coach preferences: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = CoachPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: authResult.user.id },
      select: { settings: true },
    });

    if (!account) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    const nextSettings = mergeCoachPreferencesIntoSettings(account.settings, parsed.data);

    const updated = await prisma.account.update({
      where: { id: authResult.user.id },
      data: {
        settings: nextSettings as Prisma.InputJsonValue,
      },
      select: { settings: true },
    });

    return NextResponse.json<ApiResponse<ReturnType<typeof readCoachPreferencesFromSettings>>>({
      success: true,
      data: readCoachPreferencesFromSettings(updated.settings),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to update coach preferences: ${message}` },
      { status: 500 }
    );
  }
}
