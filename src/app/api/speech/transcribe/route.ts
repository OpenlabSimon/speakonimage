import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import type { ApiResponse } from '@/types';

// Extend TranscriptionResult type for API response
interface TranscribeResponse {
  text: string;
  confidence?: number;
  duration?: number;
  status: 'success' | 'no_match' | 'error';
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

    // Get Azure credentials from environment
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Azure Speech credentials not configured' },
        { status: 500 }
      );
    }

    // Convert File to Blob
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: audioFile.type });

    // Transcribe using Azure STT
    const result = await transcribeAudio(audioBlob, {
      speechKey,
      speechRegion,
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
