'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  InterestSignal,
  GoalSignal,
  EntitySignal,
  VocabularyMemory,
  MemorySnippet,
  CoachMemoryProfile,
  RecommendationProfile,
  RecommendationFeedbackEntry,
} from '@/lib/profile/memory';

const PROFILE_CACHE_KEY_PREFIX = 'speakonimage:profile-cache:';

interface GrammarErrorSummary {
  pattern: string;
  count: number;
  originalText?: string;
  correctedText?: string;
  trend: 'improving' | 'stable' | 'increasing';
}

interface ProfileData {
  profile: {
    estimatedCefr: string;
    confidence: number;
    lastUpdated: string;
    vocabularyProfile: {
      uniqueWordCount: number;
      cefrDistribution: Record<string, number>;
      weakWords: { word: string; incorrect: number; correct: number }[];
    };
    grammarProfile: {
      topErrors: GrammarErrorSummary[];
    };
    usageProfile: {
      snapshots: Array<{
        key: 'latest_attempt' | 'rolling_30m' | 'daily';
        label: string;
        sampleCount: number;
        strengths: string[];
        weaknesses: string[];
        preferredVocabulary: string[];
        avoidVocabulary: string[];
        preferredExpressions: string[];
        avoidGrammarPatterns: string[];
        updatedAt: string;
      }>;
    };
    interests: InterestSignal[];
    goals: GoalSignal[];
    entities: EntitySignal[];
    recentVocabulary: VocabularyMemory[];
    memorySnippets: MemorySnippet[];
    coachMemory: CoachMemoryProfile;
    recommendations: RecommendationProfile;
    recommendationFeedback: RecommendationFeedbackEntry[];
  };
  stats: {
    topicCount: number;
    submissionCount: number;
    streak: number;
    vocabSize: number;
    activeDays: number;
  };
  recentSubmissions: {
    id: string;
    transcribedText: string;
    rawAudioUrl?: string | null;
    evaluation: Record<string, unknown>;
    difficultyAssessment: { overallScore?: number } | null;
    createdAt: string;
    topic: { id?: string; type: string; originalInput: string } | null;
  }[];
  recentTopics: {
    id: string;
    type: string;
    originalInput: string;
    createdAt: string;
    submissionCount: number;
    latestDraft: string | null;
    draftCount: number;
  }[];
  recentCoachFeedback: {
    id: string;
    content: string;
    speechScript: string;
    audioUrl: string | null;
    createdAt: string;
    source: 'coach_review' | 'evaluation_summary';
    topic: { id?: string; type: string; originalInput: string } | null;
  }[];
}

function getProfileCacheKey(scope: string): string {
  return `${PROFILE_CACHE_KEY_PREFIX}${scope}`;
}

function readCachedProfile(scope: string): ProfileData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getProfileCacheKey(scope));
    if (!raw) return null;
    return JSON.parse(raw) as ProfileData;
  } catch {
    return null;
  }
}

function writeCachedProfile(scope: string, data: ProfileData) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(getProfileCacheKey(scope), JSON.stringify(data));
  } catch {
    // Ignore cache write failures.
  }
}

export function useProfile(enabled = true, cacheScope = 'local') {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (options?: { background?: boolean }) => {
    if (!enabled) return;

    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch('/api/user/profile', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load profile');
      }
      setData(json.data);
      writeCachedProfile(cacheScope, json.data as ProfileData);
    } catch (err) {
      if (!background || !data) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  }, [cacheScope, data, enabled]);

  useEffect(() => {
    const cached = readCachedProfile(cacheScope);
    if (cached) {
      setData(cached);
      setLoading(false);
    }

    if (enabled) {
      void fetchProfile({ background: !!cached });
    } else {
      setData(null);
      setLoading(false);
    }
  }, [cacheScope, enabled, fetchProfile]);

  return { data, loading, error, refetch: fetchProfile };
}
