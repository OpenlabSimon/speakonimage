import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
  auth: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/profile/ProfileManager', () => ({
  computeAndUpdateProfile: vi.fn().mockResolvedValue({
    estimatedCefr: 'B1',
    confidence: 0.7,
    lastUpdated: new Date().toISOString(),
    vocabularyProfile: {
      uniqueWordCount: 50,
      cefrDistribution: { B1: 30, A2: 20 },
      weakWords: [],
    },
    grammarProfile: {
      topErrors: [],
    },
  }),
}));
vi.mock('@/lib/spaced-repetition/ReviewScheduler', () => ({
  syncReviewItems: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/user/profile/route';

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns profile with stats', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        transcribedText: 'test',
        evaluation: { overallCefrEstimate: 'B1' },
        difficultyAssessment: { overallScore: 75 },
        createdAt: new Date(),
        topic: { type: 'translation', originalInput: 'test' },
      },
    ]);
    prismaMock.topic.count.mockResolvedValue(5);
    prismaMock.submission.count.mockResolvedValue(10);
    prismaMock.submission.groupBy.mockResolvedValue([
      { createdAt: new Date(), _count: 1 },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.profile).toBeDefined();
    expect(data.data.stats.topicCount).toBe(5);
    expect(data.data.stats.submissionCount).toBe(10);
    expect(data.data.stats.vocabSize).toBe(50);
    expect(data.data.recentSubmissions).toHaveLength(1);
  });

  it('returns 404 when no speaker found', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('returns 401 for unauthenticated', async () => {
    setUnauthenticated();

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
