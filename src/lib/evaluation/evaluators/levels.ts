import { z } from 'zod';

export const EVALUATION_LEVELS = [
  'excellent',
  'strong',
  'solid',
  'developing',
  'limited',
] as const;

export type EvaluationLevel = (typeof EVALUATION_LEVELS)[number];

const LEVEL_TO_SCORE: Record<EvaluationLevel, number> = {
  excellent: 92,
  strong: 84,
  solid: 74,
  developing: 62,
  limited: 48,
};

function parseEvaluationLevel(value: string): EvaluationLevel | null {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes('excellent') ||
    normalized.includes('outstanding') ||
    normalized.includes('exceptional') ||
    normalized.includes('卓越') ||
    normalized.includes('优秀') ||
    normalized.includes('出色')
  ) {
    return 'excellent';
  }

  if (
    normalized.includes('strong') ||
    normalized.includes('very good') ||
    normalized === 'high' ||
    normalized.includes('很强') ||
    normalized.includes('较强')
  ) {
    return 'strong';
  }

  if (
    normalized.includes('solid') ||
    normalized === 'good' ||
    normalized.includes('competent') ||
    normalized.includes('良好') ||
    normalized.includes('扎实') ||
    normalized.includes('稳定')
  ) {
    return 'solid';
  }

  if (
    normalized.includes('developing') ||
    normalized.includes('fair') ||
    normalized.includes('basic') ||
    normalized.includes('一般') ||
    normalized.includes('发展中') ||
    normalized.includes('需要提升')
  ) {
    return 'developing';
  }

  if (
    normalized.includes('limited') ||
    normalized.includes('weak') ||
    normalized.includes('poor') ||
    normalized.includes('struggling') ||
    normalized.includes('较弱') ||
    normalized.includes('薄弱')
  ) {
    return 'limited';
  }

  return null;
}

export function normalizeEvaluationLevel(value: string): EvaluationLevel {
  return parseEvaluationLevel(value) ?? 'solid';
}

export function scoreFromEvaluationLevel(level: EvaluationLevel): number {
  return LEVEL_TO_SCORE[level];
}

export function levelFromScore(score: number): EvaluationLevel {
  if (score >= 90) return 'excellent';
  if (score >= 82) return 'strong';
  if (score >= 72) return 'solid';
  if (score >= 58) return 'developing';
  return 'limited';
}

export const EvaluationLevelSchema = z.string().transform((value) => normalizeEvaluationLevel(value));

export function withEvaluationLevel<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      level: EvaluationLevelSchema.optional(),
      score: z.number().min(0).max(100).optional(),
      ...shape,
    })
    .superRefine((value, ctx) => {
      const payload = value as { level?: EvaluationLevel; score?: number };
      if (typeof payload.level === 'undefined' && typeof payload.score === 'undefined') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Either level or score is required',
          path: ['level'],
        });
      }
    })
    .transform((value) => {
      const payload = value as { level?: EvaluationLevel; score?: number };
      const level =
        payload.level ?? levelFromScore(payload.score ?? scoreFromEvaluationLevel('solid'));
      const score =
        typeof payload.score === 'number' ? payload.score : scoreFromEvaluationLevel(level);

      return {
        ...value,
        level,
        score,
      };
    });
}
