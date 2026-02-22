'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TeacherCharacterId } from '@/lib/characters/types';

export interface GameProgress {
  current: number;
  total: number;
}

export interface GameResult {
  score: number;
  totalPossible: number;
  mistakes: string[];
}

export interface UsePracticeGameResult {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  gameHtml: string | null;
  gameType: string | null;
  focusAreas: string[];
  gameProgress: GameProgress | null;
  gameResult: GameResult | null;
  launchGame: () => void;
  closeGame: () => void;
}

interface LaunchParams {
  characterId: TeacherCharacterId;
  topicType: string;
  chinesePrompt: string;
  userResponse: string;
  overallScore: number;
  evaluation: Record<string, unknown>;
  cefrLevel: string;
}

export function usePracticeGame(params: LaunchParams | null): UsePracticeGameResult {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameHtml, setGameHtml] = useState<string | null>(null);
  const [gameType, setGameType] = useState<string | null>(null);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [gameProgress, setGameProgress] = useState<GameProgress | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const launchGame = useCallback(async () => {
    if (!params) return;

    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    setGameHtml(null);
    setGameType(null);
    setFocusAreas([]);
    setGameProgress(null);
    setGameResult(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/practice-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '生成练习游戏失败');
      }

      setGameHtml(result.data.gameHtml);
      setGameType(result.data.gameType);
      setFocusAreas(result.data.focusAreas);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Practice game error:', err);
      setError(err instanceof Error ? err.message : '生成练习游戏失败');
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  const closeGame = useCallback(() => {
    abortRef.current?.abort();
    setIsOpen(false);
    setIsLoading(false);
    setError(null);
    setGameHtml(null);
    setGameType(null);
    setFocusAreas([]);
    setGameProgress(null);
    setGameResult(null);
  }, []);

  // Listen for postMessage from iframe
  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type) return;

      switch (data.type) {
        case 'game-ready':
          // Game loaded successfully
          break;
        case 'game-progress':
          setGameProgress({
            current: data.current,
            total: data.total,
          });
          break;
        case 'game-complete':
          setGameResult({
            score: data.score,
            totalPossible: data.totalPossible,
            mistakes: data.mistakes || [],
          });
          break;
        case 'game-exit':
          closeGame();
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isOpen, closeGame]);

  return {
    isOpen,
    isLoading,
    error,
    gameHtml,
    gameType,
    focusAreas,
    gameProgress,
    gameResult,
    launchGame,
    closeGame,
  };
}
