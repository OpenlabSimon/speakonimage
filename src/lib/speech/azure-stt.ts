/**
 * Azure Speech-to-Text integration
 * Server-side REST API implementation
 */

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
  status: 'success' | 'no_match' | 'error';
  error?: string;
}

export interface AzureSTTConfig {
  speechKey: string;
  speechRegion: string;
  language?: string;
}

/**
 * Transcribe audio using Azure STT REST API
 * Works on server-side with raw audio data
 */
export async function transcribeAudio(
  audioBlob: Blob,
  config: AzureSTTConfig
): Promise<TranscriptionResult> {
  const { speechKey, speechRegion, language = 'en-US' } = config;

  if (!speechKey || !speechRegion) {
    return {
      text: '',
      status: 'error',
      error: 'Azure Speech credentials not configured',
    };
  }

  try {
    const audioData = await audioBlob.arrayBuffer();

    // Determine content type
    // Azure supports: audio/wav, audio/ogg, audio/webm, audio/mp3, etc.
    let contentType = audioBlob.type || 'audio/webm';

    console.log('Original audio type:', audioBlob.type, 'size:', audioBlob.size);

    // Map common types to Azure-accepted formats
    // For webm with opus, we need to specify the full content type
    if (contentType.includes('webm')) {
      // Keep the codec info if present, Azure needs it for proper decoding
      contentType = contentType.includes('opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
    } else if (contentType.includes('wav')) {
      contentType = 'audio/wav';
    } else if (contentType.includes('mp3') || contentType.includes('mpeg')) {
      contentType = 'audio/mp3';
    } else if (contentType.includes('ogg')) {
      contentType = 'audio/ogg;codecs=opus';
    }

    console.log('Using content type:', contentType);

    // Azure STT REST API endpoint
    const url = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=detailed`;

    console.log('Sending to Azure STT:', url);
    console.log('Audio data size:', audioData.byteLength, 'bytes');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': contentType,
        'Accept': 'application/json',
      },
      body: audioData,
    });

    console.log('Azure STT response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure STT error:', response.status, errorText);
      return {
        text: '',
        status: 'error',
        error: `Azure STT failed: ${response.status} - ${errorText.substring(0, 100)}`,
      };
    }

    const result = await response.json();

    if (result.RecognitionStatus === 'Success') {
      const confidence = result.NBest?.[0]?.Confidence;
      const duration = result.Duration ? result.Duration / 10000000 : undefined;

      return {
        text: result.DisplayText || '',
        confidence,
        duration,
        status: 'success',
      };
    } else if (result.RecognitionStatus === 'NoMatch') {
      return {
        text: '',
        status: 'no_match',
        error: 'No speech detected',
      };
    } else if (result.RecognitionStatus === 'InitialSilenceTimeout') {
      return {
        text: '',
        status: 'no_match',
        error: 'No speech detected (silence timeout)',
      };
    } else {
      return {
        text: '',
        status: 'error',
        error: result.RecognitionStatus || 'Unknown error',
      };
    }
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      text: '',
      status: 'error',
      error: error instanceof Error ? error.message : 'Transcription failed',
    };
  }
}

/**
 * Get Azure STT config from environment variables
 */
export function getAzureSTTConfig(): AzureSTTConfig {
  return {
    speechKey: process.env.AZURE_SPEECH_KEY || '',
    speechRegion: process.env.AZURE_SPEECH_REGION || '',
    language: 'en-US',
  };
}
