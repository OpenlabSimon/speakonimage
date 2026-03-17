export interface ElevenLabsVoiceSettings {
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
}

export async function synthesizeWithElevenLabs(
  text: string,
  voiceId: string,
  voiceSettings?: ElevenLabsVoiceSettings
): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;

  if (!key) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: voiceSettings?.modelId || 'eleven_monolingual_v1',
        voice_settings: {
          stability: voiceSettings?.stability ?? 0.5,
          similarity_boost: voiceSettings?.similarityBoost ?? 0.75,
          ...(voiceSettings?.style !== undefined && { style: voiceSettings.style }),
          ...(voiceSettings?.speakerBoost !== undefined && { use_speaker_boost: voiceSettings.speakerBoost }),
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errorText}`);
  }

  return response.arrayBuffer();
}
