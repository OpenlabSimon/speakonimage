import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAudioReview } from '@/domains/teachers/review-audio-generator';
import { hasReviewAudioSigningSecret, verifyReviewAudioToken } from '@/domains/teachers/review-audio-token';
import type { ApiResponse } from '@/types';

const ReviewAudioRequestSchema = z.object({
  token: z.string().min(1).optional(),
  teacher: z.object({
    soulId: z.enum(['default', 'gentle', 'strict', 'humorous', 'scholarly', 'energetic']),
    voiceId: z.string().min(1).optional(),
  }),
  review: z.object({
    mode: z.enum(['text', 'audio', 'html', 'all']),
    autoPlayAudio: z.boolean(),
  }),
  speechScript: z.string().min(1).optional(),
  ttsText: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ReviewAudioRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const tokenPayload = parsed.data.token ? verifyReviewAudioToken(parsed.data.token) : null;
    const strictTokenRequired = process.env.NODE_ENV === 'production' || hasReviewAudioSigningSecret();

    if (parsed.data.token && !tokenPayload) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid or expired review audio token' },
        { status: 403 }
      );
    }

    if (strictTokenRequired && !tokenPayload) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Review audio token required' },
        { status: 403 }
      );
    }

    const speechScript = tokenPayload?.speechScript ?? parsed.data.speechScript ?? parsed.data.ttsText;
    if (!speechScript) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'speechScript is required' },
        { status: 400 }
      );
    }

    const audioReview = await buildAudioReview({
      teacher: tokenPayload?.teacher ?? parsed.data.teacher,
      review: tokenPayload?.review ?? parsed.data.review,
      speechScript,
    });

    return NextResponse.json<ApiResponse<typeof audioReview>>({
      success: true,
      data: audioReview,
    });
  } catch (error) {
    console.error('Review audio error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Review audio failed: ${message}` },
      { status: 500 }
    );
  }
}
