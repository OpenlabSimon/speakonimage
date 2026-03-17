'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { DEFAULT_REVIEW_MODE } from '@/domains/teachers/defaults';
import type { ReviewMode } from '@/domains/teachers/types';
import { normalizeCoachPreferences, type CoachPreferences } from '@/lib/user/coach-preferences';
import { DEFAULT_CHARACTER_ID } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

const STORAGE_KEY = 'speakonimage-coach-preferences';

export function useCoachPreferences() {
  const { status } = useSession();
  const [reviewMode, setReviewModeState] = useState<ReviewMode>(DEFAULT_REVIEW_MODE);
  const [autoPlayAudio, setAutoPlayAudioState] = useState(false);
  const [characterId, setCharacterIdState] = useState<TeacherCharacterId>(DEFAULT_CHARACTER_ID);
  const [voiceId, setVoiceIdState] = useState<string>('');

  const persistLocal = useCallback((next: CoachPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = normalizeCoachPreferences(JSON.parse(stored));
      setReviewModeState(parsed.reviewMode);
      setAutoPlayAudioState(parsed.autoPlayAudio);
      setCharacterIdState(parsed.characterId);
      setVoiceIdState(parsed.voiceId ?? '');
    } catch {
      // localStorage may be unavailable or data may be malformed
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;

    async function loadRemotePreferences() {
      try {
        const response = await fetch('/api/user/coach-preferences', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) return;

        const result = await response.json();
        if (!result.success || cancelled) return;

        const remote = normalizeCoachPreferences(result.data);
        setReviewModeState(remote.reviewMode);
        setAutoPlayAudioState(remote.autoPlayAudio);
        setCharacterIdState(remote.characterId);
        setVoiceIdState(remote.voiceId ?? '');
        persistLocal(remote);
      } catch {
        // Keep local fallback when remote load fails
      }
    }

    void loadRemotePreferences();

    return () => {
      cancelled = true;
    };
  }, [persistLocal, status]);

  const persistRemote = useCallback(async (next: CoachPreferences) => {
    if (status !== 'authenticated') return;

    try {
      await fetch('/api/user/coach-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      // Keep local state even if remote sync fails
    }
  }, [status]);

  const updatePreferences = useCallback((next: CoachPreferences) => {
    setReviewModeState(next.reviewMode);
    setAutoPlayAudioState(next.autoPlayAudio);
    setCharacterIdState(next.characterId);
    setVoiceIdState(next.voiceId ?? '');
    persistLocal(next);
    void persistRemote(next);
  }, [persistLocal, persistRemote]);

  const setReviewMode = useCallback((mode: ReviewMode) => {
    updatePreferences({
      reviewMode: mode,
      autoPlayAudio,
      characterId,
      voiceId: voiceId || undefined,
    });
  }, [autoPlayAudio, characterId, updatePreferences, voiceId]);

  const setAutoPlayAudio = useCallback((enabled: boolean) => {
    updatePreferences({
      reviewMode,
      autoPlayAudio: enabled,
      characterId,
      voiceId: voiceId || undefined,
    });
  }, [characterId, reviewMode, updatePreferences, voiceId]);

  const setCharacterId = useCallback((nextCharacterId: TeacherCharacterId) => {
    updatePreferences({
      reviewMode,
      autoPlayAudio,
      characterId: nextCharacterId,
      voiceId: voiceId || undefined,
    });
  }, [autoPlayAudio, reviewMode, updatePreferences, voiceId]);

  const setVoiceId = useCallback((nextVoiceId: string) => {
    updatePreferences({
      reviewMode,
      autoPlayAudio,
      characterId,
      voiceId: nextVoiceId.trim() || undefined,
    });
  }, [autoPlayAudio, characterId, reviewMode, updatePreferences]);

  return {
    reviewMode,
    setReviewMode,
    autoPlayAudio,
    setAutoPlayAudio,
    characterId,
    setCharacterId,
    voiceId,
    setVoiceId,
    isRemoteBacked: status === 'authenticated',
  };
}
