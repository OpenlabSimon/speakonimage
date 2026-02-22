import { describe, it, expect } from 'vitest';
import { scoreToLevel, levelToScore } from '@/hooks/useLevelHistory';
import type { CEFRLevel } from '@/types';

describe('scoreToLevel', () => {
  describe('boundary values', () => {
    it.each([
      [0, 'A1'],
      [29, 'A1'],
      [30, 'A2'],
      [44, 'A2'],
      [45, 'B1'],
      [59, 'B1'],
      [60, 'B2'],
      [74, 'B2'],
      [75, 'C1'],
      [89, 'C1'],
      [90, 'C2'],
      [100, 'C2'],
    ] as [number, CEFRLevel][])(
      'score %d maps to %s',
      (score, expectedLevel) => {
        expect(scoreToLevel(score)).toBe(expectedLevel);
      }
    );
  });

  it('returns A1 for negative scores', () => {
    expect(scoreToLevel(-10)).toBe('A1');
  });

  it('returns C2 for scores above 100', () => {
    expect(scoreToLevel(150)).toBe('C2');
  });
});

describe('levelToScore', () => {
  it.each([
    ['A1', 20],
    ['A2', 35],
    ['B1', 50],
    ['B2', 65],
    ['C1', 80],
    ['C2', 95],
  ] as [CEFRLevel, number][])(
    'level %s maps to score %d',
    (level, expectedScore) => {
      expect(levelToScore(level)).toBe(expectedScore);
    }
  );
});

describe('round-trip consistency', () => {
  it('levelToScore(scoreToLevel(50)) returns a valid score', () => {
    const level = scoreToLevel(50);
    const score = levelToScore(level);
    // 50 maps to B1, B1 maps to 50
    expect(level).toBe('B1');
    expect(score).toBe(50);
  });

  it('round-trip for each level midpoint is stable', () => {
    const midpoints: [number, CEFRLevel, number][] = [
      [10, 'A1', 20],
      [35, 'A2', 35],
      [50, 'B1', 50],
      [65, 'B2', 65],
      [80, 'C1', 80],
      [95, 'C2', 95],
    ];

    for (const [inputScore, expectedLevel, expectedRoundTrip] of midpoints) {
      const level = scoreToLevel(inputScore);
      expect(level).toBe(expectedLevel);
      expect(levelToScore(level)).toBe(expectedRoundTrip);
    }
  });

  it('re-applying scoreToLevel after round-trip yields the same level', () => {
    const originalScore = 50;
    const level1 = scoreToLevel(originalScore);
    const mappedScore = levelToScore(level1);
    const level2 = scoreToLevel(mappedScore);
    expect(level2).toBe(level1);
  });
});
