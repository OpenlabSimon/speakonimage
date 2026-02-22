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

import { GET, DELETE, PATCH } from '@/app/api/sessions/[id]/route';
import { NextRequest } from 'next/server';

const mockSession = {
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
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/sessions/[id]', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns session details', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1');
    const response = await GET(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('session-1');
  });

  it('returns 404 for non-existent session', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sessions/nonexistent');
    const response = await GET(request, makeParams('nonexistent'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('returns 403 for wrong owner', async () => {
    setAuthenticated({ id: 'other-user' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1');
    const response = await GET(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });
});

describe('DELETE /api/sessions/[id]', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('ends session and triggers extraction', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);
    prismaMock.chatMessage.findMany.mockResolvedValue([]);
    prismaMock.chatSession.update.mockResolvedValue({
      ...mockSession,
      status: 'ended',
      endedAt: new Date(),
    });

    const request = new NextRequest('http://localhost/api/sessions/session-1', { method: 'DELETE' });
    const response = await DELETE(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ended');
  });

  it('returns 401 for unauthenticated', async () => {
    setUnauthenticated();

    const request = new NextRequest('http://localhost/api/sessions/session-1', { method: 'DELETE' });
    const response = await DELETE(request, makeParams('session-1'));
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/sessions/[id]', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('transitions active session to ended', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);
    prismaMock.chatMessage.findMany.mockResolvedValue([]);
    prismaMock.chatSession.update.mockResolvedValue({
      ...mockSession,
      status: 'ended',
      endedAt: new Date(),
    });

    const request = new NextRequest('http://localhost/api/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended' }),
    });
    const response = await PATCH(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns existing session when no status change', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.chatSession.findUnique.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ someField: 'value' }),
    });
    const response = await PATCH(request, makeParams('session-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe('active');
  });
});
