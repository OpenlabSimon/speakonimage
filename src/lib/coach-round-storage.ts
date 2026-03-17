import type { AudioReview, HtmlArtifact, ReviewMode, TeacherSelection } from '@/domains/teachers/types';
import type { InputMethod, PracticeMode, SkillDomain } from '@/types';

export const LATEST_COACH_ROUND_STORAGE_KEY = 'speakonimage-latest-coach-round';
export const COACH_ROUND_HISTORY_STORAGE_KEY = 'speakonimage-coach-round-history';
const MAX_COACH_ROUND_HISTORY = 12;

export interface StoredCoachRound {
  id: string;
  teacher: TeacherSelection;
  reviewMode: ReviewMode;
  autoPlayAudio: boolean;
  reviewText: string;
  ttsText: string;
  audioReview: AudioReview;
  htmlArtifact: HtmlArtifact;
  overallScore: number;
  userResponse: string;
  inputMethod: InputMethod;
  practiceMode?: PracticeMode;
  skillDomain?: SkillDomain;
  createdAt: string;
}

type StorableCoachRoundInput = Omit<StoredCoachRound, 'id'> & {
  id?: string;
};

function buildRoundId(round: StorableCoachRoundInput): string {
  if (round.id) return round.id;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${round.createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStoredCoachRound(round: StorableCoachRoundInput | null): StoredCoachRound | null {
  if (!round) return null;

  return {
    ...round,
    id: buildRoundId(round),
  };
}

export function saveLatestCoachRound(round: StorableCoachRoundInput): StoredCoachRound | undefined {
  if (typeof window === 'undefined') return;

  try {
    const normalized = normalizeStoredCoachRound(round);
    if (!normalized) return;

    window.localStorage.setItem(LATEST_COACH_ROUND_STORAGE_KEY, JSON.stringify(normalized));

    const history = loadCoachRoundHistory().filter((item) => item.id !== normalized.id);
    const nextHistory = [normalized, ...history].slice(0, MAX_COACH_ROUND_HISTORY);
    window.localStorage.setItem(COACH_ROUND_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));

    return normalized;
  } catch {
    // Ignore storage failures in browser-restricted environments
  }
}

export function loadLatestCoachRound(): StoredCoachRound | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(LATEST_COACH_ROUND_STORAGE_KEY);
    if (!stored) return null;
    return normalizeStoredCoachRound(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function loadCoachRoundHistory(): StoredCoachRound[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(COACH_ROUND_HISTORY_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as StorableCoachRoundInput[];
    return parsed
      .map((item) => normalizeStoredCoachRound(item))
      .filter((item): item is StoredCoachRound => Boolean(item));
  } catch {
    return [];
  }
}
