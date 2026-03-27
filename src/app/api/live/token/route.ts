import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getGeminiLiveModel, getGeminiLiveWsUrl, isGeminiLiveEnabled } from '@/lib/live/gemini-live';
import { createGeminiEphemeralToken } from '@/lib/live/gemini-live-server';
import type { ApiResponse } from '@/types';

const LiveTokenRequestSchema = z.object({
  uses: z.number().int().min(1).max(10).optional(),
  expireTimeSeconds: z.number().int().min(10).max(300).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!isGeminiLiveEnabled()) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Gemini Live is disabled' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = LiveTokenRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const token = await createGeminiEphemeralToken({
      uses: parsed.data.uses,
    });

    return NextResponse.json<ApiResponse<{
      provider: 'gemini-live';
      tokenName: string;
      expireTime?: string;
      model: string;
      wsUrl: string;
    }>>({
      success: true,
      data: {
        provider: 'gemini-live',
        tokenName: token.name,
        expireTime: token.expireTime,
        model: getGeminiLiveModel(),
        wsUrl: getGeminiLiveWsUrl(),
      },
    });
  } catch (error) {
    console.error('Gemini Live token error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Gemini Live token failed: ${message}` },
      { status: 500 }
    );
  }
}
