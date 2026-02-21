'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CEFRLevel } from '@/types';

// Level history score record
export interface LevelScoreRecord {
  date: string;
  score: number;
  estimatedLevel: CEFRLevel;
}

// Full level history stored in localStorage
export interface LevelHistory {
  currentLevel: CEFRLevel;
  confidence: number; // 0-1, increases with more samples
  lastUpdated: string; // ISO date
  introductionText?: string;
  recentScores: LevelScoreRecord[]; // Last 10 evaluations
}

// Jump detection result
export interface JumpDetection {
  detected: boolean;
  direction: 'up' | 'down' | null;
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  scoreDifference: number;
}

const STORAGE_KEY = 'speakonimage_level_history';
const MAX_RECENT_SCORES = 10;
const JUMP_THRESHOLD = 15; // Score difference threshold for jump detection
const LEVEL_EXPIRY_DAYS = 7;

// CEFR level to numeric mapping for calculations
const LEVEL_TO_SCORE: Record<CEFRLevel, number> = {
  A1: 20,
  A2: 35,
  B1: 50,
  B2: 65,
  C1: 80,
  C2: 95,
};

const SCORE_TO_LEVEL: { min: number; level: CEFRLevel }[] = [
  { min: 90, level: 'C2' },
  { min: 75, level: 'C1' },
  { min: 60, level: 'B2' },
  { min: 45, level: 'B1' },
  { min: 30, level: 'A2' },
  { min: 0, level: 'A1' },
];

/**
 * Convert score to CEFR level
 */
export function scoreToLevel(score: number): CEFRLevel {
  for (const { min, level } of SCORE_TO_LEVEL) {
    if (score >= min) return level;
  }
  return 'A1';
}

/**
 * Convert CEFR level to numeric score
 */
export function levelToScore(level: CEFRLevel): number {
  return LEVEL_TO_SCORE[level];
}

/**
 * Calculate weighted average score from recent scores
 * Recent scores are weighted more heavily: weight = 1 / (daysAgo + 1)
 */
function calculateWeightedScore(scores: LevelScoreRecord[]): number {
  if (scores.length === 0) return 50; // Default to B1 level

  const now = new Date();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const record of scores) {
    const recordDate = new Date(record.date);
    const daysAgo = Math.floor(
      (now.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const weight = 1 / (daysAgo + 1);

    weightedSum += record.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 50;
}

/**
 * Calculate confidence based on number of samples
 */
function calculateConfidence(sampleCount: number): number {
  // Confidence increases with more samples, maxing out around 10 samples
  return Math.min(sampleCount / 10, 1);
}

/**
 * Check if level history has expired (older than 7 days)
 */
function isLevelExpired(lastUpdated: string): boolean {
  const lastDate = new Date(lastUpdated);
  const now = new Date();
  const daysDiff = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysDiff > LEVEL_EXPIRY_DAYS;
}

/**
 * Hook for managing user's CEFR level history
 */
export function useLevelHistory() {
  const [history, setHistory] = useState<LevelHistory | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LevelHistory;
        setHistory(parsed);
      }
    } catch (error) {
      console.error('Failed to load level history:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: LevelHistory) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.error('Failed to save level history:', error);
    }
  }, []);

  // Check if user needs initial assessment
  const needsAssessment = useCallback((): boolean => {
    if (!history) return true;
    if (isLevelExpired(history.lastUpdated)) return true;
    return false;
  }, [history]);

  // Initialize level from introduction assessment
  const initializeLevel = useCallback(
    (level: CEFRLevel, confidence: number, introductionText?: string) => {
      const newHistory: LevelHistory = {
        currentLevel: level,
        confidence,
        lastUpdated: new Date().toISOString(),
        introductionText,
        recentScores: [],
      };
      saveHistory(newHistory);
      return newHistory;
    },
    [saveHistory]
  );

  // Add a new score and update level
  const addScore = useCallback(
    (score: number, estimatedLevel: CEFRLevel): JumpDetection => {
      const now = new Date().toISOString();
      const newRecord: LevelScoreRecord = {
        date: now,
        score,
        estimatedLevel,
      };

      const currentHistory = history || {
        currentLevel: 'B1' as CEFRLevel,
        confidence: 0,
        lastUpdated: now,
        recentScores: [],
      };

      // Calculate average of recent scores before adding new one
      const avgRecentScore =
        currentHistory.recentScores.length > 0
          ? currentHistory.recentScores.reduce((sum, r) => sum + r.score, 0) /
            currentHistory.recentScores.length
          : levelToScore(currentHistory.currentLevel);

      // Add new score to recent scores (keep last 10)
      const newRecentScores = [
        ...currentHistory.recentScores.slice(-(MAX_RECENT_SCORES - 1)),
        newRecord,
      ];

      // Calculate new weighted score and level
      const weightedScore = calculateWeightedScore(newRecentScores);
      const newLevel = scoreToLevel(weightedScore);
      const newConfidence = calculateConfidence(newRecentScores.length);

      // Detect jumps
      const scoreDifference = score - avgRecentScore;
      const jumpDetected =
        currentHistory.recentScores.length >= 2 &&
        Math.abs(scoreDifference) > JUMP_THRESHOLD;

      const jumpDetection: JumpDetection = {
        detected: jumpDetected,
        direction: jumpDetected
          ? scoreDifference > 0
            ? 'up'
            : 'down'
          : null,
        fromLevel: currentHistory.currentLevel,
        toLevel: newLevel,
        scoreDifference,
      };

      // Save updated history
      const newHistory: LevelHistory = {
        ...currentHistory,
        currentLevel: newLevel,
        confidence: newConfidence,
        lastUpdated: now,
        recentScores: newRecentScores,
      };
      saveHistory(newHistory);

      return jumpDetection;
    },
    [history, saveHistory]
  );

  // Manually set level (user override)
  const setLevel = useCallback(
    (level: CEFRLevel) => {
      const currentHistory = history || {
        currentLevel: level,
        confidence: 0.5,
        lastUpdated: new Date().toISOString(),
        recentScores: [],
      };

      const newHistory: LevelHistory = {
        ...currentHistory,
        currentLevel: level,
        lastUpdated: new Date().toISOString(),
      };
      saveHistory(newHistory);
    },
    [history, saveHistory]
  );

  // Get current level (with default)
  const getCurrentLevel = useCallback((): CEFRLevel => {
    return history?.currentLevel || 'B1';
  }, [history]);

  // Clear all history
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setHistory(null);
    } catch (error) {
      console.error('Failed to clear level history:', error);
    }
  }, []);

  return {
    history,
    isLoaded,
    needsAssessment,
    initializeLevel,
    addScore,
    setLevel,
    getCurrentLevel,
    clearHistory,
    // Utility exports
    scoreToLevel,
    levelToScore,
  };
}
