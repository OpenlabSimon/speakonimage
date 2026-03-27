import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSpeechTranscriptionAvailability,
  getSpeechTranscriptionUnavailableMessage,
} from '@/lib/speech/transcription-config';

describe('speech transcription config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reports unavailable when azure speech env is missing', () => {
    expect(getSpeechTranscriptionAvailability()).toEqual({
      available: false,
      provider: null,
      reason: getSpeechTranscriptionUnavailableMessage(),
    });
  });

  it('reports azure when both speech env values are present', () => {
    process.env.AZURE_SPEECH_KEY = 'azure-key\\n';
    process.env.AZURE_SPEECH_REGION = ' eastasia ';

    expect(getSpeechTranscriptionAvailability()).toEqual({
      available: true,
      provider: 'azure',
      reason: null,
      speechKey: 'azure-key',
      speechRegion: 'eastasia',
    });
  });
});
