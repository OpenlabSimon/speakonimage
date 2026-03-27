// ProfileInjector - builds profile context string for LLM prompt injection

import { prisma } from '@/lib/db';
import { getPersistedProfileSignals } from './memory';

function compactList(values: string[], limit: number): string[] {
  return values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length > 0)
    .slice(0, limit);
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildStructuredProfileContext(input: {
  estimatedCefr?: string;
  interests: string[];
  goals: string[];
  errorPatterns: Array<{ pattern: string; count: number }>;
  weakVocabulary: string[];
  recentUserMemory?: string | null;
  recentCoachMemory?: string | null;
  currentRoundReminders: string[];
}): string | null {
  const sections: string[] = [];

  if (input.estimatedCefr) {
    sections.push(`level=${input.estimatedCefr}`);
  }

  const interests = compactList(input.interests, 3);
  if (interests.length > 0) {
    sections.push(`interests=${interests.join('|')}`);
  }

  const goals = compactList(input.goals, 3);
  if (goals.length > 0) {
    sections.push(`goals=${goals.join('|')}`);
  }

  const errorPatterns = input.errorPatterns
    .slice(0, 4)
    .map((item) => `${item.pattern}(${item.count})`);
  if (errorPatterns.length > 0) {
    sections.push(`errors=${errorPatterns.join('|')}`);
  }

  const weakVocabulary = compactList(input.weakVocabulary, 6);
  if (weakVocabulary.length > 0) {
    sections.push(`weak_vocab=${weakVocabulary.join('|')}`);
  }

  if (input.recentUserMemory) {
    sections.push(`recent_user=${compactText(input.recentUserMemory, 80)}`);
  }

  if (input.recentCoachMemory) {
    sections.push(`recent_coach=${compactText(input.recentCoachMemory, 80)}`);
  }

  const currentRoundReminders = compactList(input.currentRoundReminders, 2);
  if (currentRoundReminders.length > 0) {
    sections.push(`round_focus=${currentRoundReminders.map((item) => compactText(item, 48)).join('|')}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return `PROFILE{${sections.join('; ')}}`;
}

/**
 * Build a Chinese-language profile context string for injection into evaluation prompts.
 * Returns null if no meaningful data exists yet (new user).
 */
export async function buildProfileContext(speakerId: string): Promise<string | null> {
  // Run all independent queries in parallel
  const [speaker, grammarErrors, weakVocab] = await Promise.all([
    prisma.speaker.findUnique({
      where: { id: speakerId },
      select: { languageProfile: true },
    }),
    prisma.grammarError.groupBy({
      by: ['errorPattern'],
      where: { speakerId },
      _count: { errorPattern: true },
      orderBy: { _count: { errorPattern: 'desc' } },
      take: 4,
    }),
    prisma.vocabularyUsage.findMany({
      where: {
        speakerId,
        usedCorrectly: false,
      },
      select: { word: true },
      distinct: ['word'],
      take: 6,
    }),
  ]);

  if (!speaker) return null;

  const profile = speaker.languageProfile as Record<string, unknown> | null;
  const persistedSignals = getPersistedProfileSignals(profile);
  const errorPatterns = grammarErrors.map((err) => ({
    pattern: err.errorPattern,
    count: err._count.errorPattern,
  }));

  // If no data at all, return null
  if (errorPatterns.length === 0 && weakVocab.length === 0 && !profile) {
    return null;
  }

  // Current level from profile
  const estimatedCefr = profile?.estimatedCefr as string | undefined;
  const interests = persistedSignals.interests.map((item) => item.label);
  const goals = persistedSignals.goals.map((item) => item.label);
  const recentCoachMemory = persistedSignals.memorySnippets.find((item) => item.kind === 'coach_feedback');
  const recentUserMemory = persistedSignals.memorySnippets.find((item) => item.kind === 'user_output');
  const currentRoundReminders = persistedSignals.currentRoundReminders.map((item) => item.text);
  return buildStructuredProfileContext({
    estimatedCefr,
    interests,
    goals,
    errorPatterns,
    weakVocabulary: weakVocab.map((item) => item.word),
    recentUserMemory: recentUserMemory?.summary,
    recentCoachMemory: recentCoachMemory?.summary,
    currentRoundReminders,
  });
}

export const __test__ = {
  buildStructuredProfileContext,
};
