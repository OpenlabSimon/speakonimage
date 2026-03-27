export type SpeechProvider = 'azure' | 'elevenlabs';

export const PREFERRED_TTS_PROVIDER: SpeechProvider = 'azure';

export function resolvePreferredTTSProvider(requested?: SpeechProvider): SpeechProvider {
  if (PREFERRED_TTS_PROVIDER === 'azure') {
    return 'azure';
  }

  return requested ?? PREFERRED_TTS_PROVIDER;
}
