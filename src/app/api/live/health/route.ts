import { NextRequest, NextResponse } from 'next/server';
import { getGeminiLiveModel, isGeminiLiveEnabled } from '@/lib/live/gemini-live';
import { createGeminiEphemeralToken } from '@/lib/live/gemini-live-server';
import type { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  const probe = request.nextUrl.searchParams.get('probe') === '1';

  if (!isGeminiLiveEnabled()) {
    return NextResponse.json<ApiResponse<{
      enabled: false;
      stage: 'disabled';
      model: string;
    }>>({
      success: true,
      data: {
        enabled: false,
        stage: 'disabled',
        model: getGeminiLiveModel(),
      },
    });
  }

  if (!probe) {
    return NextResponse.json<ApiResponse<{
      enabled: true;
      stage: 'configured';
      model: string;
    }>>({
      success: true,
      data: {
        enabled: true,
        stage: 'configured',
        model: getGeminiLiveModel(),
      },
    });
  }

  try {
    const token = await createGeminiEphemeralToken({ uses: 1 });
    return NextResponse.json<ApiResponse<{
      enabled: true;
      stage: 'token_ok';
      model: string;
      tokenName: string;
      expireTime?: string;
    }>>({
      success: true,
      data: {
        enabled: true,
        stage: 'token_ok',
        model: getGeminiLiveModel(),
        tokenName: token.name,
        expireTime: token.expireTime,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<{
      enabled: true;
      stage: 'token_failed';
      model: string;
      errorCode: 'network' | 'auth' | 'unknown';
      message: string;
    }>>(
      {
        success: false,
        error: message,
        data: {
          enabled: true,
          stage: 'token_failed',
          model: getGeminiLiveModel(),
          errorCode: classifyLiveHealthError(message),
          message,
        },
      },
      { status: 502 }
    );
  }
}

function classifyLiveHealthError(message: string): 'network' | 'auth' | 'unknown' {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('fetch failed') ||
    normalized.includes('timed out') ||
    normalized.includes('ssl') ||
    normalized.includes('network')
  ) {
    return 'network';
  }

  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('api_key_invalid') ||
    normalized.includes('api key not valid') ||
    normalized.includes('invalid api key') ||
    normalized.includes('pass a valid api key') ||
    normalized.includes('permission') ||
    normalized.includes('denied') ||
    normalized.includes('unauthorized')
  ) {
    return 'auth';
  }

  return 'unknown';
}
