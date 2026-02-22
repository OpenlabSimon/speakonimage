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
  consecutiveFailures: number; // Track consecutive below-level scores
}

// Result from addScore — only downgrades happen automatically
export interface LevelChangeResult {
  downgraded: boolean;
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  consecutiveFailures: number;
}

const STORAGE_KEY = 'speakonimage_level_history';
const MAX_RECENT_SCORES = 10;
const CONSECUTIVE_FAILURES_TO_DOWNGRADE = 3;

// Ordered CEFR levels for navigation
const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Minimum score threshold for each level — scoring below this counts as a failure
const LEVEL_FAILURE_THRESHOLD: Record<CEFRLevel, number> = {
  A1: 0,  // Can't fail below A1
  A2: 30,
  B1: 45,
  B2: 60,
  C1: 75,
  C2: 90,
};

/**
 * Get the level one step below the given level (or A1 if already at bottom)
 */
function getLevelBelow(level: CEFRLevel): CEFRLevel {
  const idx = CEFR_ORDER.indexOf(level);
  return idx > 0 ? CEFR_ORDER[idx - 1] : 'A1';
}

/**
 * Get the level one step above the given level (or C2 if already at top)
 */
function getLevelAbove(level: CEFRLevel): CEFRLevel {
  const idx = CEFR_ORDER.indexOf(level);
  return idx < CEFR_ORDER.length - 1 ? CEFR_ORDER[idx + 1] : 'C2';
}

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
 * Calculate confidence based on number of samples
 */
function calculateConfidence(sampleCount: number): number {
  return Math.min(sampleCount / 10, 1);
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

  // Check if user needs initial assessment (only when no history exists)
  const needsAssessment = useCallback((): boolean => {
    return !history;
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
        consecutiveFailures: 0,
      };
      saveHistory(newHistory);
      return newHistory;
    },
    [saveHistory]
  );

  // Add a new score — level stays the same by default.
  // Auto-downgrades one level after CONSECUTIVE_FAILURES_TO_DOWNGRADE consecutive failures.
  // Never auto-upgrades — user must call upgradeLevel() manually.
  const addScore = useCallback(
    (score: number, estimatedLevel: CEFRLevel): LevelChangeResult => {
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
        consecutiveFailures: 0,
      };

      const currentLevel = currentHistory.currentLevel;
      const failureThreshold = LEVEL_FAILURE_THRESHOLD[currentLevel];

      // Add new score to recent scores (keep last 10)
      const newRecentScores = [
        ...currentHistory.recentScores.slice(-(MAX_RECENT_SCORES - 1)),
        newRecord,
      ];
      const newConfidence = calculateConfidence(newRecentScores.length);

      // Check if this score is a failure (below threshold for current level)
      const isFailing = score < failureThreshold;
      const newConsecutiveFailures = isFailing
        ? (currentHistory.consecutiveFailures ?? 0) + 1
        : 0; // Reset on any passing score

      // Auto-downgrade if enough consecutive failures (and not already at A1)
      const shouldDowngrade =
        newConsecutiveFailures >= CONSECUTIVE_FAILURES_TO_DOWNGRADE &&
        currentLevel !== 'A1';

      const newLevel = shouldDowngrade ? getLevelBelow(currentLevel) : currentLevel;

      const result: LevelChangeResult = {
        downgraded: shouldDowngrade,
        fromLevel: currentLevel,
        toLevel: newLevel,
        consecutiveFailures: shouldDowngrade ? 0 : newConsecutiveFailures,
      };

      // Save updated history
      const newHistory: LevelHistory = {
        ...currentHistory,
        currentLevel: newLevel,
        confidence: newConfidence,
        lastUpdated: now,
        recentScores: newRecentScores,
        consecutiveFailures: shouldDowngrade ? 0 : newConsecutiveFailures,
      };
      saveHistory(newHistory);

      return result;
    },
    [history, saveHistory]
  );

  // Upgrade level by one step (user-initiated only)
  const upgradeLevel = useCallback(() => {
    if (!history) return;
    const nextLevel = getLevelAbove(history.currentLevel);
    if (nextLevel === history.currentLevel) return; // Already at C2

    const newHistory: LevelHistory = {
      ...history,
      currentLevel: nextLevel,
      lastUpdated: new Date().toISOString(),
      consecutiveFailures: 0,
    };
    saveHistory(newHistory);
  }, [history, saveHistory]);

  // Manually set level (user override)
  const setLevel = useCallback(
    (level: CEFRLevel) => {
      const currentHistory = history || {
        currentLevel: level,
        confidence: 0.5,
        lastUpdated: new Date().toISOString(),
        recentScores: [],
        consecutiveFailures: 0,
      };

      const newHistory: LevelHistory = {
        ...currentHistory,
        currentLevel: level,
        lastUpdated: new Date().toISOString(),
        consecutiveFailures: 0,
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
    upgradeLevel,
    setLevel,
    getCurrentLevel,
    clearHistory,
    // Utility exports
    scoreToLevel,
    levelToScore,
  };
}
