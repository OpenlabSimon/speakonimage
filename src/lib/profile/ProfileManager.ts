// ProfileManager - on-demand profile computation from DB aggregations (no LLM calls)

import { prisma } from '@/lib/db';
import { syncReviewItems } from '@/lib/spaced-repetition/ReviewScheduler';
import type { CEFRLevel } from '@/types';

interface GrammarErrorSummary {
  pattern: string;
  count: number;
  originalText?: string;
  correctedText?: string;
  trend: 'improving' | 'stable' | 'increasing';
}

interface VocabularyProfile {
  uniqueWordCount: number;
  cefrDistribution: Record<string, number>;
  weakWords: { word: string; incorrect: number; correct: number }[];
}

interface GrammarProfile {
  topErrors: GrammarErrorSummary[];
}

interface ComputedProfile {
  estimatedCefr: CEFRLevel;
  confidence: number;
  lastUpdated: string;
  vocabularyProfile: VocabularyProfile;
  grammarProfile: GrammarProfile;
}

/**
 * Compute and update the full language profile for a speaker.
 * All data comes from DB aggregations — no LLM calls.
 */
export async function computeAndUpdateProfile(speakerId: string): Promise<ComputedProfile> {
  const [grammarProfile, vocabularyProfile, cefrEstimate] = await Promise.all([
    computeGrammarProfile(speakerId),
    computeVocabularyProfile(speakerId),
    estimateCefrLevel(speakerId),
  ]);

  const profile: ComputedProfile = {
    estimatedCefr: cefrEstimate.level,
    confidence: cefrEstimate.confidence,
    lastUpdated: new Date().toISOString(),
    vocabularyProfile,
    grammarProfile,
  };

  await prisma.speaker.update({
    where: { id: speakerId },
    data: {
      languageProfile: profile as object,
      lastActiveAt: new Date(),
    },
  });

  // Sync review items from GrammarError/VocabularyUsage (idempotent)
  await syncReviewItems(speakerId);

  return profile;
}

/**
 * Compute grammar profile: top error patterns with counts and trends.
 */
async function computeGrammarProfile(speakerId: string): Promise<GrammarProfile> {
  // Get top error patterns by frequency
  const topPatterns = await prisma.grammarError.groupBy({
    by: ['errorPattern'],
    where: { speakerId },
    _count: { errorPattern: true },
    orderBy: { _count: { errorPattern: 'desc' } },
    take: 15,
  });

  if (topPatterns.length === 0) {
    return { topErrors: [] };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // For each pattern: get a recent example and 7-day trend
  const topErrors = await Promise.all(
    topPatterns.map(async (p) => {
      const [example, recentCount] = await Promise.all([
        prisma.grammarError.findFirst({
          where: { speakerId, errorPattern: p.errorPattern },
          orderBy: { createdAt: 'desc' },
          select: { originalText: true, correctedText: true },
        }),
        prisma.grammarError.count({
          where: {
            speakerId,
            errorPattern: p.errorPattern,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
      ]);

      // Trend: if >50% of all occurrences are in the last 7 days, it's increasing
      const totalCount = p._count.errorPattern;
      let trend: 'improving' | 'stable' | 'increasing' = 'stable';
      if (totalCount >= 3) {
        const recentRatio = recentCount / totalCount;
        if (recentRatio > 0.6) trend = 'increasing';
        else if (recentRatio < 0.2) trend = 'improving';
      }

      return {
        pattern: p.errorPattern,
        count: totalCount,
        originalText: example?.originalText || undefined,
        correctedText: example?.correctedText || undefined,
        trend,
      };
    })
  );

  return { topErrors };
}

/**
 * Compute vocabulary profile: unique words, CEFR distribution, weak words.
 */
async function computeVocabularyProfile(speakerId: string): Promise<VocabularyProfile> {
  const [uniqueWords, cefrCounts, weakWordData] = await Promise.all([
    // Unique word count
    prisma.vocabularyUsage.groupBy({
      by: ['word'],
      where: { speakerId },
      _count: true,
    }),
    // CEFR distribution — group by cefrLevel
    prisma.vocabularyUsage.groupBy({
      by: ['cefrLevel'],
      where: { speakerId, cefrLevel: { not: null } },
      _count: true,
    }),
    // Words with more incorrect than correct usage
    prisma.$queryRawUnsafe<{ word: string; incorrect: bigint; correct: bigint }[]>(
      `SELECT word,
              COUNT(*) FILTER (WHERE "usedCorrectly" = false) AS incorrect,
              COUNT(*) FILTER (WHERE "usedCorrectly" = true) AS correct
       FROM "VocabularyUsage"
       WHERE "speakerId" = $1
       GROUP BY word
       HAVING COUNT(*) FILTER (WHERE "usedCorrectly" = false) > COUNT(*) FILTER (WHERE "usedCorrectly" = true)
       ORDER BY COUNT(*) FILTER (WHERE "usedCorrectly" = false) DESC
       LIMIT 20`,
      speakerId
    ),
  ]);

  const cefrDistribution: Record<string, number> = {};
  for (const c of cefrCounts) {
    if (c.cefrLevel) {
      cefrDistribution[c.cefrLevel] = c._count;
    }
  }

  const weakWords = weakWordData.map((w) => ({
    word: w.word,
    incorrect: Number(w.incorrect),
    correct: Number(w.correct),
  }));

  return {
    uniqueWordCount: uniqueWords.length,
    cefrDistribution,
    weakWords,
  };
}

/**
 * Estimate CEFR level from recent submissions' overallCefrEstimate.
 * Uses mode of last 10 submissions. Confidence = consistency ratio.
 */
async function estimateCefrLevel(speakerId: string): Promise<{ level: CEFRLevel; confidence: number }> {
  const recentSubmissions = await prisma.submission.findMany({
    where: { speakerId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { evaluation: true },
  });

  if (recentSubmissions.length === 0) {
    return { level: 'B1', confidence: 0 };
  }

  // Extract CEFR estimates from evaluation JSON
  const levels: CEFRLevel[] = [];
  for (const sub of recentSubmissions) {
    const eval_ = sub.evaluation as { overallCefrEstimate?: string } | null;
    if (eval_?.overallCefrEstimate) {
      levels.push(eval_.overallCefrEstimate as CEFRLevel);
    }
  }

  if (levels.length === 0) {
    return { level: 'B1', confidence: 0 };
  }

  // Find mode (most frequent level)
  const counts = new Map<string, number>();
  for (const l of levels) {
    counts.set(l, (counts.get(l) || 0) + 1);
  }

  let modeLevel: CEFRLevel = 'B1';
  let maxCount = 0;
  for (const [level, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeLevel = level as CEFRLevel;
    }
  }

  // Confidence = how consistent the estimates are (mode frequency / total)
  const confidence = Math.round((maxCount / levels.length) * 100) / 100;

  return { level: modeLevel, confidence };
}
