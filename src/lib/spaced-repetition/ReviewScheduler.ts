// ReviewScheduler - manages due items, review recording, and item syncing

import { prisma } from '@/lib/db';
import { schedule, previewSchedule, type Card, type Rating, type State } from './fsrs';

interface ReviewItemData {
  id: string;
  itemType: string;
  itemKey: string;
  displayData: Record<string, unknown>;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  lastReview: Date | null;
  nextReview: Date;
  schedulePreview?: Record<1 | 2 | 3 | 4, string>;
}

function toCard(item: {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  lastReview: Date | null;
}): Card {
  return {
    stability: item.stability,
    difficulty: item.difficulty,
    elapsedDays: item.elapsedDays,
    scheduledDays: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as State,
    lastReview: item.lastReview,
  };
}

/**
 * Get due review items for a speaker.
 */
export async function getDueItems(speakerId: string, limit = 20): Promise<ReviewItemData[]> {
  const items = await prisma.reviewItem.findMany({
    where: {
      speakerId,
      nextReview: { lte: new Date() },
    },
    orderBy: { nextReview: 'asc' },
    take: limit,
  });

  return items.map((item) => ({
    id: item.id,
    itemType: item.itemType,
    itemKey: item.itemKey,
    displayData: item.displayData as Record<string, unknown>,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsedDays: item.elapsedDays,
    scheduledDays: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state,
    lastReview: item.lastReview,
    nextReview: item.nextReview,
    schedulePreview: previewSchedule(toCard(item)),
  }));
}

/**
 * Record a review: apply FSRS schedule and update the item in DB.
 */
export async function recordReview(itemId: string, rating: Rating): Promise<ReviewItemData> {
  const item = await prisma.reviewItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw new Error(`Review item not found: ${itemId}`);
  }

  const card = toCard(item);
  const now = new Date();
  const result = schedule(card, rating, now);

  const updated = await prisma.reviewItem.update({
    where: { id: itemId },
    data: {
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      elapsedDays: result.card.elapsedDays,
      scheduledDays: result.card.scheduledDays,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      lastReview: result.card.lastReview,
      nextReview: result.nextReview,
    },
  });

  return {
    id: updated.id,
    itemType: updated.itemType,
    itemKey: updated.itemKey,
    displayData: updated.displayData as Record<string, unknown>,
    stability: updated.stability,
    difficulty: updated.difficulty,
    elapsedDays: updated.elapsedDays,
    scheduledDays: updated.scheduledDays,
    reps: updated.reps,
    lapses: updated.lapses,
    state: updated.state,
    lastReview: updated.lastReview,
    nextReview: updated.nextReview,
  };
}

/**
 * Sync review items from GrammarError/VocabularyUsage tables.
 * Creates items for patterns/words with 2+ occurrences.
 * Idempotent — upserts by [speakerId, itemType, itemKey], never resets existing FSRS state.
 */
export async function syncReviewItems(speakerId: string): Promise<void> {
  // Get grammar patterns with 2+ occurrences
  const grammarPatterns = await prisma.grammarError.groupBy({
    by: ['errorPattern'],
    where: { speakerId },
    _count: { errorPattern: true },
    having: { errorPattern: { _count: { gte: 2 } } },
  });

  // Get vocabulary words with 2+ occurrences
  const vocabWords = await prisma.vocabularyUsage.groupBy({
    by: ['word'],
    where: { speakerId },
    _count: { word: true },
    having: { word: { _count: { gte: 2 } } },
  });

  // Fetch display data for grammar items
  const grammarUpserts = await Promise.all(
    grammarPatterns.map(async (p) => {
      const example = await prisma.grammarError.findFirst({
        where: { speakerId, errorPattern: p.errorPattern },
        orderBy: { createdAt: 'desc' },
        select: { originalText: true, correctedText: true },
      });

      return prisma.reviewItem.upsert({
        where: {
          speakerId_itemType_itemKey: {
            speakerId,
            itemType: 'grammar',
            itemKey: p.errorPattern,
          },
        },
        create: {
          speakerId,
          itemType: 'grammar',
          itemKey: p.errorPattern,
          displayData: {
            pattern: p.errorPattern,
            example: example?.originalText || '',
            correction: example?.correctedText || '',
          },
        },
        // Only update displayData, never reset FSRS state
        update: {
          displayData: {
            pattern: p.errorPattern,
            example: example?.originalText || '',
            correction: example?.correctedText || '',
          },
        },
      });
    })
  );

  // Fetch display data for vocabulary items
  const vocabUpserts = await Promise.all(
    vocabWords.map(async (v) => {
      const usage = await prisma.vocabularyUsage.findFirst({
        where: { speakerId, word: v.word },
        orderBy: { createdAt: 'desc' },
        select: { cefrLevel: true },
      });

      return prisma.reviewItem.upsert({
        where: {
          speakerId_itemType_itemKey: {
            speakerId,
            itemType: 'vocabulary',
            itemKey: v.word,
          },
        },
        create: {
          speakerId,
          itemType: 'vocabulary',
          itemKey: v.word,
          displayData: {
            word: v.word,
            cefrLevel: usage?.cefrLevel || null,
          },
        },
        update: {
          displayData: {
            word: v.word,
            cefrLevel: usage?.cefrLevel || null,
          },
        },
      });
    })
  );

  void grammarUpserts;
  void vocabUpserts;
}

/**
 * Get review stats for a speaker (due count, total, next review time).
 */
export async function getReviewStats(speakerId: string): Promise<{
  dueCount: number;
  totalItems: number;
  nextReviewAt: Date | null;
}> {
  const [dueCount, totalItems, nextItem] = await Promise.all([
    prisma.reviewItem.count({
      where: { speakerId, nextReview: { lte: new Date() } },
    }),
    prisma.reviewItem.count({ where: { speakerId } }),
    prisma.reviewItem.findFirst({
      where: { speakerId, nextReview: { gt: new Date() } },
      orderBy: { nextReview: 'asc' },
      select: { nextReview: true },
    }),
  ]);

  return {
    dueCount,
    totalItems,
    nextReviewAt: dueCount > 0 ? new Date() : (nextItem?.nextReview || null),
  };
}
