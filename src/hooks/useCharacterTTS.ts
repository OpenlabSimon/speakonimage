'use client';

import { useTTS } from './useTTS';
import type { UseTTSResult } from './useTTS';
import { getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

/**
 * Convenience hook: TTS with per-character voice config
 */
export function useCharacterTTS(characterId: TeacherCharacterId): UseTTSResult {
  const character = getCharacter(characterId);
  const { voiceConfig } = character;

  return useTTS({
    provider: 'azure',
    voice: voiceConfig.voiceId,
  });
}
