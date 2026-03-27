import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
}));

import { GET } from '@/app/api/user/topics/[id]/route';

describe('GET /api/user/topics/[id]', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns unauthorized for anonymous request', async () => {
    setUnauthenticated();

    const response = await GET(new Request('http://localhost/api/user/topics/topic-1'), {
      params: Promise.resolve({ id: 'topic-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns topic content with restored attempts', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findFirst.mockResolvedValue({
      id: 'topic-1',
      type: 'expression',
      originalInput: 'Describe your recent project',
      topicContent: {
        chinesePrompt: '描述你最近做的一个项目',
        guidingQuestions: ['你做了什么？'],
      },
      difficultyMetadata: {
        targetCefr: 'B1',
        vocabComplexity: 0.4,
        grammarComplexity: 0.5,
      },
      submissions: [
        {
          attemptNumber: 1,
          transcribedText: 'I built a small app with my friend.',
          rawAudioUrl: 'https://example.com/voice-1.mp3',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          difficultyAssessment: { overallScore: 74 },
        },
      ],
    });

    const response = await GET(new Request('http://localhost/api/user/topics/topic-1'), {
      params: Promise.resolve({ id: 'topic-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('topic-1');
    expect(data.data.attempts).toEqual([
      {
        attemptNumber: 1,
        text: 'I built a small app with my friend.',
        audioUrl: 'https://example.com/voice-1.mp3',
        timestamp: '2026-03-20T10:00:00.000Z',
        overallScore: 74,
      },
    ]);
  });
});
