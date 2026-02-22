import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/spaced-repetition/ReviewScheduler', () => ({
  syncReviewItems: vi.fn().mockResolvedValue(undefined),
}));

import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';

describe('computeAndUpdateProfile', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it('computes full profile with grammar+vocab+cefr', async () => {
    // Grammar profile
    prismaMock.grammarError.groupBy.mockResolvedValue([
      { errorPattern: 'past_tense', _count: { errorPattern: 5 } },
    ]);
    prismaMock.grammarError.findFirst.mockResolvedValue({
      originalText: 'I go there',
      correctedText: 'I went there',
    });
    prismaMock.grammarError.count.mockResolvedValue(2);

    // Vocabulary profile
    prismaMock.vocabularyUsage.groupBy
      .mockResolvedValueOnce([{ word: 'hello', _count: true }, { word: 'world', _count: true }]) // unique words
      .mockResolvedValueOnce([{ cefrLevel: 'B1', _count: 10 }]); // cefr distribution
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    // CEFR estimation
    prismaMock.submission.findMany.mockResolvedValue([
      { evaluation: { overallCefrEstimate: 'B1' } },
      { evaluation: { overallCefrEstimate: 'B1' } },
      { evaluation: { overallCefrEstimate: 'B2' } },
    ]);

    // Update speaker
    prismaMock.speaker.update.mockResolvedValue({});

    const profile = await computeAndUpdateProfile('speaker-1');

    expect(profile.estimatedCefr).toBe('B1');
    expect(profile.confidence).toBeGreaterThan(0);
    expect(profile.vocabularyProfile.uniqueWordCount).toBe(2);
    expect(profile.grammarProfile.topErrors).toHaveLength(1);
    expect(profile.grammarProfile.topErrors[0].pattern).toBe('past_tense');
    expect(prismaMock.speaker.update).toHaveBeenCalledOnce();
  });

  it('returns defaults when no data', async () => {
    prismaMock.grammarError.groupBy.mockResolvedValue([]);
    prismaMock.vocabularyUsage.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    prismaMock.submission.findMany.mockResolvedValue([]);
    prismaMock.speaker.update.mockResolvedValue({});

    const profile = await computeAndUpdateProfile('speaker-1');

    expect(profile.estimatedCefr).toBe('B1'); // default
    expect(profile.confidence).toBe(0);
    expect(profile.vocabularyProfile.uniqueWordCount).toBe(0);
    expect(profile.grammarProfile.topErrors).toHaveLength(0);
  });

  it('calculates grammar trend correctly', async () => {
    prismaMock.grammarError.groupBy.mockResolvedValue([
      { errorPattern: 'articles', _count: { errorPattern: 10 } },
    ]);
    prismaMock.grammarError.findFirst.mockResolvedValue({
      originalText: 'I go to school',
      correctedText: 'I go to the school',
    });
    // 8 out of 10 in last 7 days → increasing (ratio > 0.6)
    prismaMock.grammarError.count.mockResolvedValue(8);

    prismaMock.vocabularyUsage.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    prismaMock.submission.findMany.mockResolvedValue([]);
    prismaMock.speaker.update.mockResolvedValue({});

    const profile = await computeAndUpdateProfile('speaker-1');

    expect(profile.grammarProfile.topErrors[0].trend).toBe('increasing');
  });
});
