'use client';

import { useCallback, useState, useEffect } from 'react';

export interface UseTTSResult {
  speak: (text: string, lang?: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
}

/**
 * Hook for Text-to-Speech using Web Speech API
 * Zero cost, works in all modern browsers
 */
export function useTTS(): UseTTSResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    // Voices may load asynchronously
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  // Track speaking state
  useEffect(() => {
    if (!isSupported) return;

    const checkSpeaking = setInterval(() => {
      setIsSpeaking(speechSynthesis.speaking);
    }, 100);

    return () => clearInterval(checkSpeaking);
  }, [isSupported]);

  const speak = useCallback((text: string, lang: string = 'en-US') => {
    if (!isSupported) return;

    // Stop any current speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for learners
    utterance.pitch = 1;

    // Try to find a good English voice
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    if (englishVoices.length > 0) {
      // Prefer native voices over Microsoft/Google
      const nativeVoice = englishVoices.find(v =>
        v.name.includes('Samantha') ||
        v.name.includes('Daniel') ||
        v.name.includes('Karen') ||
        v.localService
      );
      utterance.voice = nativeVoice || englishVoices[0];
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthesis.speak(utterance);
  }, [isSupported, voices]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    voices,
  };
}
