import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, resetAuthMock, setAuthenticated, setUnauthenticated } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
}));

import { GET, PATCH } from '@/app/api/user/topics/[id]/draft-history/route';
import { NextRequest } from 'next/server';

const routeParams = { params: Promise.resolve({ id: 'topic-1' }) };

describe('GET/PATCH /api/user/topics/[id]/draft-history', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns unauthorized for anonymous request', async () => {
    setUnauthenticated();

    const response = await GET(new NextRequest('http://localhost/api/user/topics/topic-1/draft-history'), routeParams);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns topic draft history for the owner', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findUnique.mockResolvedValue({
      accountId: 'user-1',
      topicContent: {
        draftHistory: [
          {
            id: 'draft-1',
            text: 'Hello, I am Liu.',
            source: 'assessment',
            createdAt: '2026-03-17T00:00:00.000Z',
            label: '评估版自我介绍',
          },
        ],
      },
    });

    const response = await GET(new NextRequest('http://localhost/api/user/topics/topic-1/draft-history'), routeParams);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].text).toBe('Hello, I am Liu.');
  });

  it('updates draft history for the owner', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findUnique.mockResolvedValue({
      accountId: 'user-1',
      topicContent: {
        chinesePrompt: '用英语做一个完整的自我介绍。',
      },
    });
    prismaMock.topic.update.mockResolvedValue({
      topicContent: {
        chinesePrompt: '用英语做一个完整的自我介绍。',
        draftHistory: [
          {
            id: 'draft-2',
            text: 'Hello, I am Liu. I work in Beijing.',
            source: 'attempt',
            createdAt: '2026-03-17T00:05:00.000Z',
            label: '第 2 次文字回答',
          },
        ],
      },
    });

    const request = new NextRequest('http://localhost/api/user/topics/topic-1/draft-history', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftHistory: [
          {
            id: 'draft-2',
            text: 'Hello, I am Liu. I work in Beijing.',
            source: 'attempt',
            createdAt: '2026-03-17T00:05:00.000Z',
            label: '第 2 次文字回答',
          },
        ],
      }),
    });

    const response = await PATCH(request, routeParams);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic-1' },
      data: {
        topicContent: {
          chinesePrompt: '用英语做一个完整的自我介绍。',
          draftHistory: [
            {
              id: 'draft-2',
              text: 'Hello, I am Liu. I work in Beijing.',
              source: 'attempt',
              createdAt: '2026-03-17T00:05:00.000Z',
              label: '第 2 次文字回答',
            },
          ],
        },
      },
      select: {
        topicContent: true,
      },
    });
  });

  it('returns 403 when topic belongs to another user', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findUnique.mockResolvedValue({ accountId: 'other-user', topicContent: {} });

    const response = await GET(new NextRequest('http://localhost/api/user/topics/topic-1/draft-history'), routeParams);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });
});
