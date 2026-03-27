import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import { getSpeechTranscriptionAvailability } from '@/lib/speech/transcription-config';
import type { ApiResponse } from '@/types';

// Extend TranscriptionResult type for API response
interface TranscribeResponse {
  text: string;
  confidence?: number;
  duration?: number;
  status: 'success' | 'no_match' | 'error';
}

interface TranscribeCapabilityResponse {
  available: boolean;
  provider: 'azure' | null;
  reason: string | null;
}

export async function GET() {
  const availability = getSpeechTranscriptionAvailability();

  return NextResponse.json<ApiResponse<TranscribeCapabilityResponse>>({
    success: true,
    data: {
      available: availability.available,
      provider: availability.provider,
      reason: availability.reason,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const availability = getSpeechTranscriptionAvailability();
    if (!availability.available || !availability.speechKey || !availability.speechRegion) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: availability.reason || '语音转写不可用' },
        { status: 503 }
      );
    }

    // Convert File to Blob
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: audioFile.type });

    // Transcribe using Azure STT
    const result = await transcribeAudio(audioBlob, {
      speechKey: availability.speechKey,
      speechRegion: availability.speechRegion,
      language: 'en-US',
    });

    if (result.status === 'error') {
      return NextResponse.json<ApiResponse<TranscribeResponse>>(
        {
          success: false,
          error: result.error,
          data: {
            text: '',
            status: 'error',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<TranscribeResponse>>({
      success: result.status === 'success',
      data: {
        text: result.text,
        confidence: result.confidence,
        duration: result.duration,
        status: result.status,
      },
    });
  } catch (error) {
    console.error('Transcription API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Transcription failed: ${message}` },
      { status: 500 }
    );
  }
}
