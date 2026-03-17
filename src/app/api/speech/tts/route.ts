import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithElevenLabs } from '@/lib/speech/elevenlabs';

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

/**
 * Azure TTS using REST API
 * Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech
 */
async function azureTTS(text: string, voice?: string): Promise<ArrayBuffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'westus3';

  if (!key) {
    throw new Error('AZURE_SPEECH_KEY not configured');
  }

  // Default to a natural English voice
  const voiceName = voice || 'en-US-JennyNeural';

  const ssml = `
    <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
      <voice name='${voiceName}'>
        <prosody rate='0.9'>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS failed: ${response.status} - ${errorText}`);
  }

  return response.arrayBuffer();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(request: NextRequest) {
  try {
    const body: TTSRequest = await request.json();
    const { text, provider = 'azure', voice, voiceSettings } = body;

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

    let audioBuffer: ArrayBuffer;

    if (provider === 'elevenlabs') {
      audioBuffer = await synthesizeWithElevenLabs(
        text,
        voice || '21m00Tcm4TlvDq8ikWAM',
        voiceSettings
      );
    } else {
      audioBuffer = await azureTTS(text, voice);
    }

    // Return audio as base64 for easier client handling
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      success: true,
      data: {
        audio: base64Audio,
        format: 'mp3',
        provider,
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
