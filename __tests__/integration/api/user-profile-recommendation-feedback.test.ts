import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, resetAuthMock, setAuthenticated, setUnauthenticated } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
}));
vi.mock('@/lib/profile/ProfileManager', () => ({
  computeAndUpdateProfile: vi.fn().mockResolvedValue({
    estimatedCefr: 'B1',
    confidence: 0.7,
    lastUpdated: new Date().toISOString(),
    vocabularyProfile: {
      uniqueWordCount: 20,
      cefrDistribution: { B1: 20 },
      weakWords: [],
    },
    grammarProfile: {
      topErrors: [],
    },
    interests: [],
    goals: [],
    entities: [],
    recentVocabulary: [],
    memorySnippets: [],
    coachMemory: {
      longTermReminders: [],
      currentRoundReminders: [],
    },
    recommendations: {
      topics: [],
      vocabulary: [],
      examples: [],
      nextFocus: [],
      generatedAt: new Date().toISOString(),
    },
    recommendationFeedback: [
      {
        id: 'feedback-topic-1',
        recommendationId: 'topic-1',
        recommendationKind: 'topic',
        recommendationTitle: '围绕 AI tools 继续开口',
        sentiment: 'helpful',
        relatedInterestKeys: ['ai-tools'],
        createdAt: new Date().toISOString(),
      },
    ],
    hiddenInterestKeys: [],
  }),
}));

import { PATCH } from '@/app/api/user/profile/recommendations/feedback/route';

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/user/profile/recommendations/feedback', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/user/profile/recommendations/feedback', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('stores recommendation feedback', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({
      id: 'speaker-1',
      languageProfile: {
        interests: [
          {
            key: 'ai-tools',
            label: 'AI tools',
            source: 'session_topic',
            strength: 2,
            evidenceCount: 2,
            lastSeenAt: new Date().toISOString(),
          },
        ],
      },
    });
    prismaMock.speaker.update.mockResolvedValue({});

    const response = await PATCH(makeRequest({
      recommendationId: 'topic-1',
      recommendationKind: 'topic',
      recommendationTitle: '围绕 AI tools 继续开口',
      sentiment: 'helpful',
      relatedInterestKeys: ['ai-tools'],
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.speaker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          languageProfile: expect.objectContaining({
            recommendationFeedback: expect.arrayContaining([
              expect.objectContaining({
                recommendationId: 'topic-1',
                sentiment: 'helpful',
              }),
            ]),
          }),
        }),
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    setUnauthenticated();

    const response = await PATCH(makeRequest({
      recommendationId: 'topic-1',
      recommendationKind: 'topic',
      recommendationTitle: '围绕 AI tools 继续开口',
      sentiment: 'helpful',
      relatedInterestKeys: ['ai-tools'],
    }));

    expect(response.status).toBe(401);
  });
});
