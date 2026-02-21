'use client';

import { useCallback, useState, useRef } from 'react';

export type TTSProvider = 'azure' | 'elevenlabs';

export interface UseTTSOptions {
  provider?: TTSProvider;
  voice?: string;
}

export interface UseTTSResult {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for Text-to-Speech using Azure or ElevenLabs
 * - Azure: for words and topic content
 * - ElevenLabs: for feedback and reviews
 */
export function useTTS(options: UseTTSOptions = {}): UseTTSResult {
  const { provider = 'azure', voice } = options;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any current playback
    stop();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, provider, voice }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      // Convert base64 to audio and play
      const audioData = result.data.audio;
      const audioBlob = base64ToBlob(audioData, 'audio/mpeg');
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        setError('Audio playback failed');
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      setError(err instanceof Error ? err.message : 'TTS failed');
    } finally {
      setIsLoading(false);
    }
  }, [provider, voice, stop]);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
  };
}

// Helper to convert base64 to Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Convenience hook for word/topic pronunciation (Azure)
 */
export function useAzureTTS(voice?: string): UseTTSResult {
  return useTTS({ provider: 'azure', voice });
}

/**
 * Convenience hook for feedback/reviews (ElevenLabs)
 */
export function useElevenLabsTTS(voice?: string): UseTTSResult {
  return useTTS({ provider: 'elevenlabs', voice });
}
