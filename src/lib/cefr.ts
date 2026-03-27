import type { CEFRLevel } from '@/types';

const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const DESCRIPTIVE_MAP: Array<{ pattern: RegExp; level: CEFRLevel }> = [
  { pattern: /\b(mastery|native[- ]?like)\b/i, level: 'C2' },
  { pattern: /\b(upper[- ]?intermediate)\b/i, level: 'B2' },
  { pattern: /\b(pre[- ]?intermediate|lower[- ]?intermediate)\b/i, level: 'B1' },
  { pattern: /\b(beginner|elementary|basic)\b/i, level: 'A2' },
  { pattern: /\b(intermediate)\b/i, level: 'B1' },
  { pattern: /\b(advanced|proficient)\b/i, level: 'C1' },
  { pattern: /\b(fluent)\b/i, level: 'C2' },
];

export function isCEFRLevel(value: string): value is CEFRLevel {
  return CEFR_LEVELS.includes(value as CEFRLevel);
}

export function compareCefrLevels(a: CEFRLevel, b: CEFRLevel): number {
  return CEFR_LEVELS.indexOf(a) - CEFR_LEVELS.indexOf(b);
}

export function normalizeCefrLevel(value: unknown, fallback: CEFRLevel = 'B1'): CEFRLevel {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const compact = trimmed.toUpperCase().replace(/\s+/g, '');
  const exactMatch = compact.match(/[ABC][12]/);
  if (exactMatch && isCEFRLevel(exactMatch[0])) {
    return exactMatch[0];
  }

  for (const entry of DESCRIPTIVE_MAP) {
    if (entry.pattern.test(trimmed)) {
      return entry.level;
    }
  }

  return fallback;
}
