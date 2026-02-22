'use client';

import { useState, useEffect, useCallback } from 'react';

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
}

export function useProfile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/profile');
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load profile');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { data, loading, error, refetch: fetchProfile };
}
