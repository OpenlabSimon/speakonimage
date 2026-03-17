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
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    vi.mocked(computeAndUpdateProfile).mockClear();
  });

  it('returns profile with stats', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1', languageProfile: null });
    prismaMock.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        transcribedText: 'test',
        evaluation: {
          type: 'expression',
          overallCefrEstimate: 'B1',
          relevance: { comment: '回应方向是对的。' },
          depth: { comment: '内容可以再展开一点。' },
          languageQuality: { comment: '语法控制还有提升空间。' },
        },
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
    prismaMock.topic.findMany.mockResolvedValue([
      {
        id: 'topic-1',
        type: 'expression',
        originalInput: 'Introduce yourself',
        topicContent: {
          draftHistory: [
            { id: 'draft-1', text: 'Hello, my name is Alice.', source: 'assessment', createdAt: new Date().toISOString(), label: '评估初稿' },
          ],
        },
        createdAt: new Date(),
        _count: { submissions: 1 },
      },
    ]);
    prismaMock.chatMessage.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        content: '这次整体表现很稳。',
        createdAt: new Date(),
        metadata: { kind: 'coach_review' },
        session: {
          topic: {
            id: 'topic-1',
            type: 'expression',
            originalInput: 'Introduce yourself',
          },
        },
      },
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
    expect(data.data.recentTopics).toHaveLength(1);
    expect(data.data.recentTopics[0].latestDraft).toBe('Hello, my name is Alice.');
    expect(data.data.recentCoachFeedback).toHaveLength(2);
  });

  it('uses fresh stored profile without recomputing', async () => {
    const freshProfile = {
      estimatedCefr: 'B2',
      confidence: 0.9,
      lastUpdated: new Date().toISOString(),
      vocabularyProfile: {
        uniqueWordCount: 120,
        cefrDistribution: { B2: 80, B1: 40 },
        weakWords: [],
      },
      grammarProfile: {
        topErrors: [],
      },
    };

    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1', languageProfile: freshProfile });
    prismaMock.submission.findMany.mockResolvedValue([]);
    prismaMock.topic.count.mockResolvedValue(0);
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.submission.groupBy.mockResolvedValue([]);
    prismaMock.topic.findMany.mockResolvedValue([]);
    prismaMock.chatMessage.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.profile.estimatedCefr).toBe('B2');
    expect(computeAndUpdateProfile).not.toHaveBeenCalled();
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
