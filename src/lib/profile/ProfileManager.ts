// ProfileManager - on-demand profile computation from DB aggregations (no LLM calls)

import { prisma } from '@/lib/db';
import { syncReviewItems } from '@/lib/spaced-repetition/ReviewScheduler';
import type { CEFRLevel } from '@/types';
import { buildCoachMemory, buildRecommendations, getPersistedProfileSignals } from './memory';
import { buildEnhancedRecommendations } from './recommendations';

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

interface ProfileWindowSnapshot {
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
}

interface UsageProfile {
  snapshots: ProfileWindowSnapshot[];
}

interface ComputedProfile {
  estimatedCefr: CEFRLevel;
  confidence: number;
  lastUpdated: string;
  vocabularyProfile: VocabularyProfile;
  grammarProfile: GrammarProfile;
  usageProfile: UsageProfile;
  interests: ReturnType<typeof getPersistedProfileSignals>['interests'];
  goals: ReturnType<typeof getPersistedProfileSignals>['goals'];
  entities: ReturnType<typeof getPersistedProfileSignals>['entities'];
  recentVocabulary: ReturnType<typeof getPersistedProfileSignals>['recentVocabulary'];
  memorySnippets: ReturnType<typeof getPersistedProfileSignals>['memorySnippets'];
  coachMemory: ReturnType<typeof buildCoachMemory>;
  recommendations: ReturnType<typeof getPersistedProfileSignals>['recommendations'];
  recommendationFeedback: ReturnType<typeof getPersistedProfileSignals>['recommendationFeedback'];
  hiddenInterestKeys: ReturnType<typeof getPersistedProfileSignals>['hiddenInterestKeys'];
}

/**
 * Compute and update the full language profile for a speaker.
 * All data comes from DB aggregations — no LLM calls.
 */
export async function computeAndUpdateProfile(speakerId: string): Promise<ComputedProfile> {
  const speaker = await prisma.speaker.findUnique({
    where: { id: speakerId },
    select: { languageProfile: true },
  });

  const persistedSignals = getPersistedProfileSignals(speaker?.languageProfile);
  const [recentSubmissions, recentGrammarErrors, recentVocabularyUsage] = await Promise.all([
    prisma.submission.findMany({
      where: { speakerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        transcribedText: true,
        createdAt: true,
        evaluation: true,
      },
    }),
    prisma.grammarError.findMany({
      where: {
        speakerId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: {
        submissionId: true,
        errorPattern: true,
        createdAt: true,
      },
    }),
    prisma.vocabularyUsage.findMany({
      where: {
        speakerId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: {
        submissionId: true,
        word: true,
        usedCorrectly: true,
        createdAt: true,
      },
    }),
  ]);
  const normalizedRecentSubmissions = (recentSubmissions || []).map((submission, index) => ({
    id: typeof submission.id === 'string' ? submission.id : `submission-${index}`,
    transcribedText: typeof submission.transcribedText === 'string' ? submission.transcribedText : '',
    createdAt: submission.createdAt instanceof Date ? submission.createdAt : new Date(0),
    evaluation: submission.evaluation,
  }));
  const normalizedRecentGrammarErrors = (recentGrammarErrors || []).map((error) => ({
    submissionId: typeof error.submissionId === 'string' ? error.submissionId : '',
    errorPattern: typeof error.errorPattern === 'string' ? error.errorPattern : '',
    createdAt: error.createdAt instanceof Date ? error.createdAt : new Date(0),
  }));
  const normalizedRecentVocabularyUsage = (recentVocabularyUsage || []).map((usage) => ({
    submissionId: typeof usage.submissionId === 'string' ? usage.submissionId : '',
    word: typeof usage.word === 'string' ? usage.word : '',
    usedCorrectly: Boolean(usage.usedCorrectly),
    createdAt: usage.createdAt instanceof Date ? usage.createdAt : new Date(0),
  }));

  const [grammarProfile, vocabularyProfile] = await Promise.all([
    computeGrammarProfile(speakerId),
    computeVocabularyProfile(speakerId),
  ]);
  const cefrEstimate = estimateCefrLevelFromSubmissions(normalizedRecentSubmissions);
  const usageProfile = buildUsageProfile({
    submissions: normalizedRecentSubmissions,
    grammarErrors: normalizedRecentGrammarErrors,
    vocabularyUsage: normalizedRecentVocabularyUsage,
  });

  const baseRecommendations = buildRecommendations({
    interests: persistedSignals.interests,
    goals: persistedSignals.goals,
    recentVocabulary: persistedSignals.recentVocabulary,
    weakWords: vocabularyProfile.weakWords,
    topErrors: grammarProfile.topErrors,
  });
  const recommendations = await buildEnhancedRecommendations({
    base: baseRecommendations,
    interests: persistedSignals.interests,
    goals: persistedSignals.goals,
    recentVocabulary: persistedSignals.recentVocabulary,
    weakWords: vocabularyProfile.weakWords,
  });
  const coachMemory = buildCoachMemory({
    goals: persistedSignals.goals,
    topErrors: grammarProfile.topErrors,
    currentRoundReminders: persistedSignals.currentRoundReminders,
  });

  const profile: ComputedProfile = {
    estimatedCefr: cefrEstimate.level,
    confidence: cefrEstimate.confidence,
    lastUpdated: new Date().toISOString(),
    vocabularyProfile,
    grammarProfile,
    usageProfile,
    interests: persistedSignals.interests,
    goals: persistedSignals.goals,
    entities: persistedSignals.entities,
    recentVocabulary: persistedSignals.recentVocabulary,
    memorySnippets: persistedSignals.memorySnippets,
    coachMemory,
    recommendations,
    recommendationFeedback: persistedSignals.recommendationFeedback,
    hiddenInterestKeys: persistedSignals.hiddenInterestKeys,
  };

  await prisma.speaker.update({
    where: { id: speakerId },
    data: {
      languageProfile: profile as object,
      lastActiveAt: new Date(),
    },
  });

  // Sync review items from GrammarError/VocabularyUsage (idempotent).
  // This is secondary to rendering the profile; transient DB issues should not
  // block the profile response.
  try {
    await syncReviewItems(speakerId);
  } catch (error) {
    console.error('Profile review-item sync error:', error);
  }

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
  const weakWordDataPromise = prisma
    .$queryRawUnsafe<{ word: string; incorrect: bigint; correct: bigint }[]>(
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
    )
    .catch((error) => {
      console.error('Vocabulary weak-word query error:', error);
      return [];
    });

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
    weakWordDataPromise,
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
function estimateCefrLevelFromSubmissions(
  recentSubmissions: Array<{ evaluation: unknown }>
): { level: CEFRLevel; confidence: number } {
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

function extractTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) || []).filter((token) => token.length > 1);
}

function topKeys(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function collectExpressions(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = extractTokens(text);
    for (let i = 0; i < tokens.length - 1; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }

  const repeated = topKeys(counts, 4);
  return repeated.length > 0 ? repeated : Array.from(counts.keys()).slice(0, 3);
}

function buildWindowSnapshot(input: {
  key: ProfileWindowSnapshot['key'];
  label: string;
  submissions: Array<{ id: string; transcribedText: string; createdAt: Date }>;
  grammarErrors: Array<{ submissionId: string; errorPattern: string; createdAt: Date }>;
  vocabularyUsage: Array<{ submissionId: string; word: string; usedCorrectly: boolean; createdAt: Date }>;
}): ProfileWindowSnapshot {
  const submissionIds = new Set(input.submissions.map((item) => item.id));
  const windowErrors = input.grammarErrors.filter((item) => submissionIds.has(item.submissionId));
  const windowVocab = input.vocabularyUsage.filter((item) => submissionIds.has(item.submissionId));
  const correctWordCounts = new Map<string, number>();
  const incorrectWordCounts = new Map<string, number>();
  const grammarCounts = new Map<string, number>();

  for (const vocab of windowVocab) {
    const target = vocab.usedCorrectly ? correctWordCounts : incorrectWordCounts;
    target.set(vocab.word, (target.get(vocab.word) || 0) + 1);
  }

  for (const error of windowErrors) {
    grammarCounts.set(error.errorPattern, (grammarCounts.get(error.errorPattern) || 0) + 1);
  }

  const preferredVocabulary = topKeys(correctWordCounts, 4);
  const avoidVocabulary = Array.from(incorrectWordCounts.entries())
    .filter(([word, count]) => count > (correctWordCounts.get(word) || 0))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
  const avoidGrammarPatterns = topKeys(grammarCounts, 4);
  const preferredExpressions = collectExpressions(input.submissions.map((item) => item.transcribedText));

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (preferredVocabulary.length > 0) {
    strengths.push(`愿意主动使用 ${preferredVocabulary.slice(0, 2).join(', ')}`);
  }
  if (preferredExpressions.length > 0) {
    strengths.push(`高频固定表达：${preferredExpressions.slice(0, 2).join(' / ')}`);
  }
  if (input.submissions.some((item) => extractTokens(item.transcribedText).length >= 18)) {
    strengths.push('愿意展开内容，不只是给出极短回答');
  }

  if (avoidGrammarPatterns.length > 0) {
    weaknesses.push(`需要继续压下 ${avoidGrammarPatterns.slice(0, 2).join('、')}`);
  }
  if (avoidVocabulary.length > 0) {
    weaknesses.push(`这些词还不稳：${avoidVocabulary.slice(0, 2).join(', ')}`);
  }
  if (strengths.length === 0 && input.submissions.length > 0) {
    strengths.push('本窗口内已有稳定输出，可继续积累更多信号');
  }
  if (weaknesses.length === 0 && input.submissions.length > 0) {
    weaknesses.push('本窗口内没有显著重复问题，继续保持');
  }

  return {
    key: input.key,
    label: input.label,
    sampleCount: input.submissions.length,
    strengths,
    weaknesses,
    preferredVocabulary,
    avoidVocabulary,
    preferredExpressions,
    avoidGrammarPatterns,
    updatedAt: new Date().toISOString(),
  };
}

function buildUsageProfile(input: {
  submissions: Array<{ id: string; transcribedText: string; createdAt: Date }>;
  grammarErrors: Array<{ submissionId: string; errorPattern: string; createdAt: Date }>;
  vocabularyUsage: Array<{ submissionId: string; word: string; usedCorrectly: boolean; createdAt: Date }>;
}): UsageProfile {
  const latestSubmission = input.submissions[0];
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const latestAttemptSubmissions = latestSubmission ? [latestSubmission] : [];
  const rolling30mSubmissions = input.submissions.filter((item) => item.createdAt >= thirtyMinutesAgo);
  const dailySubmissions = input.submissions.filter((item) => item.createdAt >= todayStart);

  return {
    snapshots: [
      buildWindowSnapshot({
        key: 'latest_attempt',
        label: '本次',
        submissions: latestAttemptSubmissions,
        grammarErrors: input.grammarErrors,
        vocabularyUsage: input.vocabularyUsage,
      }),
      buildWindowSnapshot({
        key: 'rolling_30m',
        label: '近30分钟',
        submissions: rolling30mSubmissions,
        grammarErrors: input.grammarErrors,
        vocabularyUsage: input.vocabularyUsage,
      }),
      buildWindowSnapshot({
        key: 'daily',
        label: '今天',
        submissions: dailySubmissions,
        grammarErrors: input.grammarErrors,
        vocabularyUsage: input.vocabularyUsage,
      }),
    ],
  };
}
