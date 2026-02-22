import { vi, describe, it, expect, beforeEach } from 'vitest';
import { transcribeAudio, getAzureSTTConfig } from '@/lib/speech/azure-stt';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('azure-stt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAzureSTTConfig', () => {
    it('returns speech key and region from environment variables', () => {
      const config = getAzureSTTConfig();

      expect(config).toEqual(
        expect.objectContaining({
          speechKey: process.env.AZURE_SPEECH_KEY,
          speechRegion: process.env.AZURE_SPEECH_REGION,
        })
      );
    });
  });

  describe('transcribeAudio', () => {
    const validConfig = {
      speechKey: 'test-speech-key',
      speechRegion: 'eastus',
    };

    it('returns success with text, confidence, and duration on successful recognition', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          RecognitionStatus: 'Success',
          DisplayText: 'Hello world',
          NBest: [{ Confidence: 0.95 }],
          Duration: 50000000,
        }),
      });

      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const result = await transcribeAudio(audioBlob, validConfig);

      expect(result.status).toBe('success');
      expect(result.text).toBe('Hello world');
      expect(result.confidence).toBe(0.95);
      expect(result.duration).toBe(5); // 50000000 / 10000000
    });

    it('returns no_match status when RecognitionStatus is NoMatch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          RecognitionStatus: 'NoMatch',
        }),
      });

      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const result = await transcribeAudio(audioBlob, validConfig);

      expect(result.status).toBe('no_match');
    });

    it('returns no_match status on InitialSilenceTimeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          RecognitionStatus: 'InitialSilenceTimeout',
        }),
      });

      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const result = await transcribeAudio(audioBlob, validConfig);

      expect(result.status).toBe('no_match');
    });

    it('returns error status on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const result = await transcribeAudio(audioBlob, validConfig);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('returns error status when credentials are missing', async () => {
      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });

      const resultNoKey = await transcribeAudio(audioBlob, {
        speechKey: '',
        speechRegion: 'eastus',
      });
      expect(resultNoKey.status).toBe('error');
      expect(resultNoKey.error).toBeDefined();

      const resultNoRegion = await transcribeAudio(audioBlob, {
        speechKey: 'test-key',
        speechRegion: '',
      });
      expect(resultNoRegion.status).toBe('error');
      expect(resultNoRegion.error).toBeDefined();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends the correct content type header based on audio blob type', async () => {
      const contentTypes = [
        { blobType: 'audio/wav', expected: 'audio/wav' },
        { blobType: 'audio/webm', expected: 'audio/webm' },
        { blobType: 'audio/mp3', expected: 'audio/mp3' },
        { blobType: 'audio/ogg', expected: 'audio/ogg' },
      ];

      for (const { blobType, expected } of contentTypes) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            RecognitionStatus: 'Success',
            DisplayText: 'Test',
            NBest: [{ Confidence: 0.9 }],
            Duration: 10000000,
          }),
        });

        const audioBlob = new Blob(['audio-data'], { type: blobType });
        await transcribeAudio(audioBlob, validConfig);

        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const requestOptions = lastCall[1];

        expect(requestOptions.headers).toEqual(
          expect.objectContaining({
            'Content-Type': expected,
          })
        );
      }
    });

    it('calls the correct Azure REST API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          RecognitionStatus: 'Success',
          DisplayText: 'Hello',
          NBest: [{ Confidence: 0.9 }],
          Duration: 10000000,
        }),
      });

      const audioBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      await transcribeAudio(audioBlob, validConfig);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain(validConfig.speechRegion);
    });
  });
});
