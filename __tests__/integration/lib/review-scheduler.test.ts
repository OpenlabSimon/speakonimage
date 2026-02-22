import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import { getDueItems, recordReview, syncReviewItems, getReviewStats } from '@/lib/spaced-repetition/ReviewScheduler';

const mockItem = {
  id: 'item-1',
  speakerId: 'speaker-1',
  itemType: 'grammar',
  itemKey: 'past_tense',
  displayData: { pattern: 'past_tense' },
  stability: 2.4,
  difficulty: 5.0,
  elapsedDays: 0,
  scheduledDays: 1,
  reps: 0,
  lapses: 0,
  state: 'New',
  lastReview: null,
  nextReview: new Date(Date.now() - 1000),
};

describe('getDueItems', () => {
  beforeEach(() => resetPrismaMock());

  it('returns due items with schedule preview', async () => {
    prismaMock.reviewItem.findMany.mockResolvedValue([mockItem]);

    const items = await getDueItems('speaker-1');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('item-1');
    expect(items[0].schedulePreview).toBeDefined();
    expect(items[0].schedulePreview![1]).toMatch(/分钟|小时|天/);
  });
});

describe('recordReview', () => {
  beforeEach(() => resetPrismaMock());

  it('applies FSRS schedule and updates item', async () => {
    prismaMock.reviewItem.findUnique.mockResolvedValue(mockItem);
    prismaMock.reviewItem.update.mockImplementation(async ({ data }) => ({
      ...mockItem,
      ...data,
    }));

    const result = await recordReview('item-1', 3);

    expect(result.reps).toBe(1);
    expect(prismaMock.reviewItem.update).toHaveBeenCalledOnce();
    const updateCall = prismaMock.reviewItem.update.mock.calls[0][0];
    expect(updateCall.data.reps).toBe(1);
    expect(updateCall.data.state).toBe('Review'); // Good on New → Review
  });

  it('throws for non-existent item', async () => {
    prismaMock.reviewItem.findUnique.mockResolvedValue(null);

    await expect(recordReview('nonexistent', 3)).rejects.toThrow('not found');
  });
});

describe('syncReviewItems', () => {
  beforeEach(() => resetPrismaMock());

  it('creates review items for patterns/words with 2+ occurrences', async () => {
    prismaMock.grammarError.groupBy.mockResolvedValue([
      { errorPattern: 'past_tense', _count: { errorPattern: 3 } },
    ]);
    prismaMock.vocabularyUsage.groupBy.mockResolvedValue([
      { word: 'explore', _count: { word: 2 } },
    ]);
    prismaMock.grammarError.findFirst.mockResolvedValue({
      originalText: 'I go there',
      correctedText: 'I went there',
    });
    prismaMock.vocabularyUsage.findFirst.mockResolvedValue({
      cefrLevel: 'B1',
    });
    prismaMock.reviewItem.upsert.mockResolvedValue({});

    await syncReviewItems('speaker-1');

    expect(prismaMock.reviewItem.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('getReviewStats', () => {
  beforeEach(() => resetPrismaMock());

  it('returns correct stats', async () => {
    prismaMock.reviewItem.count
      .mockResolvedValueOnce(5) // dueCount
      .mockResolvedValueOnce(20); // totalItems
    prismaMock.reviewItem.findFirst.mockResolvedValue(null);

    const stats = await getReviewStats('speaker-1');

    expect(stats.dueCount).toBe(5);
    expect(stats.totalItems).toBe(20);
  });
});
