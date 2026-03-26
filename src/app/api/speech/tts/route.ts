import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithAzureTTS } from '@/lib/speech/azure';
import { resolvePreferredTTSProvider } from '@/lib/speech/provider';

// TTS provider types
type TTSProvider = 'azure' | 'elevenlabs';

interface VoiceSettings {
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
}

interface TTSRequest {
  text: string;
  provider?: TTSProvider;
  voice?: string;
  voiceSettings?: VoiceSettings;
}

export async function POST(request: NextRequest) {
  try {
    const body: TTSRequest = await request.json();
    const { text, provider = 'azure', voice } = body;
    const resolvedProvider = resolvePreferredTTSProvider(provider);

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      );
    }

    // Limit text length for safety
    if (text.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Text too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    const audioBuffer = await synthesizeWithAzureTTS(text, voice);

    // Return audio as base64 for easier client handling
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      success: true,
      data: {
        audio: base64Audio,
        format: 'mp3',
        provider: resolvedProvider,
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'TTS failed',
      },
      { status: 500 }
    );
  }
}
