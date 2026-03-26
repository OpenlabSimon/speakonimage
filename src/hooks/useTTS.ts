'use client';

import { useCallback, useState, useRef } from 'react';
import { getApiErrorMessage, parseJsonResponse } from '@/lib/http/parse-json-response';
import { resolvePreferredTTSProvider } from '@/lib/speech/provider';

export type TTSProvider = 'azure' | 'elevenlabs';

export interface VoiceSettings {
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
}

export interface UseTTSOptions {
  provider?: TTSProvider;
  voice?: string;
  voiceSettings?: VoiceSettings;
}

export interface UseTTSResult {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for Text-to-Speech.
 * The app currently routes all playback through Azure TTS.
 */
export function useTTS(options: UseTTSOptions = {}): UseTTSResult {
  const { provider = 'azure', voice, voiceSettings } = options;
  const effectiveProvider = resolvePreferredTTSProvider(provider);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback(async (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('TTS service unavailable');
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
    utteranceRef.current = utterance;

    await new Promise<void>((resolve, reject) => {
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
        reject(new Error('Browser speech synthesis failed'));
      };
      window.speechSynthesis.speak(utterance);
    });
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
        body: JSON.stringify({ text, provider: effectiveProvider, voice, ...(voiceSettings && { voiceSettings }) }),
      });

      const parsed = await parseJsonResponse<{
        success?: boolean;
        error?: string;
        data?: { audio: string };
      }>(response);
      const result = parsed.data;

      if (!parsed.ok || !result?.success || !result.data?.audio) {
        throw new Error(getApiErrorMessage(parsed, 'TTS failed'));
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
      try {
        await speakWithBrowser(text);
        setError(null);
      } catch (fallbackError) {
        setError(
          fallbackError instanceof Error
            ? fallbackError.message
            : err instanceof Error
            ? err.message
            : 'TTS failed'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveProvider, voice, voiceSettings, stop, speakWithBrowser]);

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
 * Backward-compatible alias while the app is Azure-only.
 */
export function useElevenLabsTTS(voice?: string): UseTTSResult {
  return useTTS({ provider: 'azure', voice });
}
