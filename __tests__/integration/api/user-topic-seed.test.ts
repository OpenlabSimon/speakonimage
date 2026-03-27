import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, resetAuthMock, setAuthenticated, setUnauthenticated } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
}));

import { POST } from '@/app/api/user/topics/seed/route';
import { NextRequest } from 'next/server';

describe('POST /api/user/topics/seed', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns unauthorized for anonymous request', async () => {
    setUnauthenticated();

    const request = new NextRequest('http://localhost/api/user/topics/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('creates a seeded topic with draft history', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.create.mockResolvedValue({
      id: 'topic-1',
    });

    const request = new NextRequest('http://localhost/api/user/topics/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'expression',
        originalInput: 'assessment:introduction-practice',
        topicContent: {
          chinesePrompt: '用英语做一个完整的自我介绍。',
          guidingQuestions: ['你叫什么名字？'],
          suggestedVocab: [],
          grammarHints: [],
          difficultyMetadata: {
            targetCefr: 'B1',
            vocabComplexity: 0,
            grammarComplexity: 0,
          },
          seedDraft: 'Hello, I am Liu.',
          seedDraftLabel: '评估版自我介绍',
          practiceGoal: '继续优化表达',
        },
        draftHistory: [
          {
            id: 'assessment-seed',
            text: 'Hello, I am Liu.',
            source: 'assessment',
            createdAt: '2026-03-17T00:00:00.000Z',
            label: '评估版自我介绍',
          },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.topic.create).toHaveBeenCalledWith({
      data: {
        accountId: 'user-1',
        type: 'expression',
        originalInput: 'assessment:introduction-practice',
        topicContent: {
          chinesePrompt: '用英语做一个完整的自我介绍。',
          guidingQuestions: ['你叫什么名字？'],
          suggestedVocab: [],
          grammarHints: [],
          difficultyMetadata: {
            targetCefr: 'B1',
            vocabComplexity: 0,
            grammarComplexity: 0,
          },
          seedDraft: 'Hello, I am Liu.',
          seedDraftLabel: '评估版自我介绍',
          practiceGoal: '继续优化表达',
          draftHistory: [
            {
              id: 'assessment-seed',
              text: 'Hello, I am Liu.',
              source: 'assessment',
              createdAt: '2026-03-17T00:00:00.000Z',
              label: '评估版自我介绍',
            },
          ],
        },
        difficultyMetadata: {
          targetCefr: 'B1',
          vocabComplexity: 0,
          grammarComplexity: 0,
        },
      },
    });
    expect(data.data.id).toBe('topic-1');
  });
});
