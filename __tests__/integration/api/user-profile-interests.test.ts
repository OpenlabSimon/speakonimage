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
    interests: [
      {
        key: 'ai-tools',
        label: 'AI tools',
        source: 'session_topic',
        strength: 2,
        evidenceCount: 2,
        lastSeenAt: new Date().toISOString(),
      },
      {
        key: 'startups',
        label: 'startups',
        source: 'manual',
        strength: 3,
        evidenceCount: 1,
        lastSeenAt: new Date().toISOString(),
      },
    ],
    goals: [],
    entities: [],
    recentVocabulary: [],
    memorySnippets: [],
    recommendations: {
      topics: [],
      vocabulary: [],
      examples: [],
      nextFocus: [],
      generatedAt: new Date().toISOString(),
    },
  }),
}));

import { PATCH } from '@/app/api/user/profile/interests/route';

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/user/profile/interests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/user/profile/interests', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('updates visible interests and persists hidden mistaken interests', async () => {
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
          {
            key: 'travel',
            label: 'travel',
            source: 'session_topic',
            strength: 1,
            evidenceCount: 1,
            lastSeenAt: new Date().toISOString(),
          },
        ],
      },
    });
    prismaMock.speaker.update.mockResolvedValue({});

    const response = await PATCH(makeRequest({ interests: ['AI tools', 'startups'] }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.speaker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          languageProfile: expect.objectContaining({
            hiddenInterestKeys: expect.arrayContaining(['travel']),
          }),
        }),
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    setUnauthenticated();

    const response = await PATCH(makeRequest({ interests: ['AI tools'] }));
    expect(response.status).toBe(401);
  });
});
