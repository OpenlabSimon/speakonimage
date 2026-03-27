import { readCleanEnvValue } from '@/lib/env-utils';

export type SpeechTranscriptionProvider = 'azure';

export interface SpeechTranscriptionAvailability {
  available: boolean;
  provider: SpeechTranscriptionProvider | null;
  reason: string | null;
  speechKey?: string;
  speechRegion?: string;
}

const TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  '当前环境未配置语音转写。请直接输入文字，或进入 Live 对话。';

export function getSpeechTranscriptionAvailability(): SpeechTranscriptionAvailability {
  const speechKey = readCleanEnvValue('AZURE_SPEECH_KEY');
  const speechRegion = readCleanEnvValue('AZURE_SPEECH_REGION');

  if (speechKey && speechRegion) {
    return {
      available: true,
      provider: 'azure',
      reason: null,
      speechKey,
      speechRegion,
    };
  }

  return {
    available: false,
    provider: null,
    reason: TRANSCRIPTION_UNAVAILABLE_MESSAGE,
  };
}

export function getSpeechTranscriptionUnavailableMessage(): string {
  return TRANSCRIPTION_UNAVAILABLE_MESSAGE;
}
