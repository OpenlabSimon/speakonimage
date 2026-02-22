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
vi.mock('@/lib/memory/ContextCompressor', () => ({
  compressContext: vi.fn().mockResolvedValue({ summary: '', keyPoints: [], mainTopics: [], notableErrors: [], vocabulary: [] }),
  estimateTokens: vi.fn().mockReturnValue(10),
}));
vi.mock('@/lib/memory/SessionExtractor', () => ({
  extractSessionLearningData: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/profile/ProfileManager', () => ({
  computeAndUpdateProfile: vi.fn().mockResolvedValue({}),
}));

import { POST, GET } from '@/app/api/sessions/route';
import { NextRequest } from 'next/server';

describe('POST /api/sessions', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('creates a new session', async () => {
    setAuthenticated({ id: 'user-1' });
    // No active session found
    prismaMock.chatSession.findFirst.mockResolvedValue(null);
    prismaMock.chatSession.create.mockResolvedValue({
      id: 'session-1',
      accountId: 'user-1',
      speakerId: null,
      topicId: null,
      sessionType: 'practice',
      status: 'active',
      startedAt: new Date(),
      endedAt: null,
      messageCount: 0,
      contextSummary: null,
      extractedData: null,
    });

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionType: 'practice' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('session-1');
    expect(data.data.status).toBe('active');
  });

  it('returns existing active session for same topic (dedup)', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findFirst.mockResolvedValue({
      id: 'existing-session',
      accountId: 'user-1',
      topicId: 'a0000000-0000-4000-a000-000000000001',
      sessionType: 'practice',
      status: 'active',
      startedAt: new Date(),
      endedAt: null,
      messageCount: 3,
      speakerId: null,
      contextSummary: null,
      extractedData: null,
    });

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: 'a0000000-0000-4000-a000-000000000001' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.id).toBe('existing-session');
    expect(prismaMock.chatSession.create).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated', async () => {
    setUnauthenticated();

    const request = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});

describe('GET /api/sessions', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('lists sessions', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        accountId: 'user-1',
        speakerId: null,
        topicId: null,
        sessionType: 'practice',
        status: 'active',
        startedAt: new Date(),
        endedAt: null,
        messageCount: 5,
        contextSummary: null,
        extractedData: null,
      },
    ]);

    const request = new NextRequest('http://localhost/api/sessions?limit=10&offset=0');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
  });

  it('filters by status', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sessions?status=ended');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(0);
    expect(prismaMock.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ended' }),
      })
    );
  });

  it('returns 401 for unauthenticated', async () => {
    setUnauthenticated();

    const request = new NextRequest('http://localhost/api/sessions');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
