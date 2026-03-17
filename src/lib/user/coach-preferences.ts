import { DEFAULT_REVIEW_MODE } from '@/domains/teachers/defaults';
import type { ReviewMode } from '@/domains/teachers/types';
import { DEFAULT_CHARACTER_ID, isValidCharacterId } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

const ELEVENLABS_VOICE_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

export interface CoachPreferences {
  reviewMode: ReviewMode;
  autoPlayAudio: boolean;
  characterId: TeacherCharacterId;
  voiceId?: string;
}

type JsonRecord = Record<string, unknown>;

function isReviewMode(value: unknown): value is ReviewMode {
  return value === 'text' || value === 'audio' || value === 'html' || value === 'all';
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

export function normalizeCoachPreferences(value: unknown): CoachPreferences {
  const record = asRecord(value);
  const rawVoiceId = typeof record?.voiceId === 'string' ? record.voiceId.trim() : '';
  const voiceId = ELEVENLABS_VOICE_ID_PATTERN.test(rawVoiceId) ? rawVoiceId : undefined;

  return {
    reviewMode: isReviewMode(record?.reviewMode) ? record.reviewMode : DEFAULT_REVIEW_MODE,
    autoPlayAudio: typeof record?.autoPlayAudio === 'boolean' ? record.autoPlayAudio : false,
    characterId:
      typeof record?.characterId === 'string' && isValidCharacterId(record.characterId)
        ? record.characterId
        : DEFAULT_CHARACTER_ID,
    voiceId,
  };
}

export function readCoachPreferencesFromSettings(settings: unknown): CoachPreferences {
  const settingsRecord = asRecord(settings);
  return normalizeCoachPreferences(settingsRecord?.coachPreferences);
}

export function mergeCoachPreferencesIntoSettings(
  settings: unknown,
  nextPreferences: Partial<CoachPreferences>
): JsonRecord {
  const settingsRecord = asRecord(settings) ?? {};
  const currentPreferences = readCoachPreferencesFromSettings(settingsRecord);

  return {
    ...settingsRecord,
    coachPreferences: {
      ...currentPreferences,
      ...nextPreferences,
    },
  };
}
