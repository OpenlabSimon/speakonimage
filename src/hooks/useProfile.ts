'use client';

import { useState, useEffect, useCallback } from 'react';

const PROFILE_CACHE_KEY = 'speakonimage:profile-cache';

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
  };
  stats: {
    topicCount: number;
    submissionCount: number;
    avgScore: number;
    streak: number;
    vocabSize: number;
    activeDays: number;
  };
  recentSubmissions: {
    id: string;
    transcribedText: string;
    evaluation: Record<string, unknown>;
    difficultyAssessment: { overallScore?: number } | null;
    createdAt: string;
    topic: { type: string; originalInput: string } | null;
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
    createdAt: string;
    source: 'coach_review' | 'evaluation_summary';
    topic: { id?: string; type: string; originalInput: string } | null;
  }[];
}

function readCachedProfile(): ProfileData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProfileData;
  } catch {
    return null;
  }
}

function writeCachedProfile(data: ProfileData) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore cache write failures.
  }
}

export function useProfile(enabled = true) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(() => !readCachedProfile());
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
      writeCachedProfile(json.data as ProfileData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const cached = readCachedProfile();
    if (cached) {
      setData(cached);
      setLoading(false);
    }

    if (enabled) {
      void fetchProfile({ background: !!cached });
    }
  }, [enabled, fetchProfile]);

  return { data, loading, error, refetch: fetchProfile };
}
