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
vi.mock('@/lib/memory/SessionExtractor', () => ({
  extractSessionLearningData: vi.fn().mockResolvedValue({
    sessionSummary: '学生完成了多轮 live 对话。',
    newVocabulary: [],
    errors: [],
    grammarPointsTouched: [],
    topicsDiscussed: ['daily routine'],
    suggestedFocusNext: ['把句子说完整'],
    overallProgress: 'stable',
    extractedAt: new Date(),
  }),
}));
vi.mock('@/domains/teachers/session-review', () => ({
  buildSessionReview: vi.fn().mockResolvedValue({
    headline: '本次对话复盘',
    summary: '学生已经完成多轮对话。',
    strengths: ['敢继续接话'],
    focusAreas: ['句子完整度'],
    goodPhrases: ['usually'],
    nextActions: ['每次多说一句'],
    reviewText: '这次已经能接住多轮来回了。',
    speechScript: '这次已经能接住多轮来回了。',
    generatedAt: new Date().toISOString(),
    sourceMessageCount: 2,
  }),
}));

import { POST } from '@/app/api/sessions/[id]/review-summary/route';
import { NextRequest } from 'next/server';
import { extractSessionLearningData } from '@/lib/memory/SessionExtractor';
import { buildSessionReview } from '@/domains/teachers/session-review';

const mockSession = {
  id: 'session-1',
  accountId: 'user-1',
  speakerId: null,
  topicId: null,
  sessionType: 'practice',
  status: 'active',
  startedAt: new Date(),
  endedAt: null,
  messageCount: 4,
  contextSummary: null,
  extractedData: null,
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/sessions/[id]/review-summary', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('builds a session review from live-only messages when present', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);
    prismaMock.chatMessage.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'Full review submission',
        contentType: 'text',
        metadata: { source: 'full_review', inputMethod: 'voice' },
        createdAt: new Date(),
      },
      {
        id: 'msg-2',
        sessionId: 'session-1',
        role: 'user',
        content: 'I usually cook at home.',
        contentType: 'text',
        metadata: { source: 'live_coach', inputMethod: 'voice' },
        createdAt: new Date(),
      },
      {
        id: 'msg-3',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Nice. What do you cook most often?',
        contentType: 'text',
        metadata: { source: 'live_coach' },
        createdAt: new Date(),
      },
    ]);

    const request = new NextRequest('http://localhost/api/sessions/session-1/review-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher: { soulId: 'gentle' } }),
    });

    const response = await POST(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(extractSessionLearningData).toHaveBeenCalledWith(
      [
        expect.objectContaining({ metadata: expect.objectContaining({ source: 'live_coach' }) }),
        expect.objectContaining({ metadata: expect.objectContaining({ source: 'live_coach' }) }),
      ],
      expect.objectContaining({ id: 'session-1' })
    );
    expect(buildSessionReview).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher: expect.objectContaining({ soulId: 'gentle' }),
        messages: expect.arrayContaining([
          expect.objectContaining({ metadata: expect.objectContaining({ source: 'live_coach' }) }),
        ]),
      })
    );
  });

  it('returns 401 for unauthenticated users', async () => {
    setUnauthenticated();

    const request = new NextRequest('http://localhost/api/sessions/session-1/review-summary', {
      method: 'POST',
    });

    const response = await POST(request, makeParams('session-1'));
    expect(response.status).toBe(401);
  });
});
