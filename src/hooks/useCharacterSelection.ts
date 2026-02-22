'use client';

import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_CHARACTER_ID } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';
import { isValidCharacterId } from '@/lib/characters';

const STORAGE_KEY = 'speakonimage-teacher-character';

export function useCharacterSelection() {
  const [characterId, setCharacterIdState] = useState<TeacherCharacterId>(DEFAULT_CHARACTER_ID);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidCharacterId(stored)) {
        setCharacterIdState(stored);
      }
    } catch {
      // localStorage may not be available
    }
  }, []);

  const setCharacterId = useCallback((id: TeacherCharacterId) => {
    setCharacterIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage may not be available
    }
  }, []);

  return { characterId, setCharacterId };
}
