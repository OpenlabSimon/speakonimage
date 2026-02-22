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

import { GET, POST } from '@/app/api/review/route';
import { NextRequest } from 'next/server';

const mockReviewItem = {
  id: 'item-1',
  speakerId: 'speaker-1',
  itemType: 'grammar',
  itemKey: 'past_tense',
  displayData: { pattern: 'past_tense', example: 'I go → I went' },
  stability: 2.4,
  difficulty: 5.0,
  elapsedDays: 0,
  scheduledDays: 1,
  reps: 0,
  lapses: 0,
  state: 'New',
  lastReview: null,
  nextReview: new Date(Date.now() - 1000), // Due
};

describe('GET /api/review', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns due items for authenticated user', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.reviewItem.findMany.mockResolvedValue([mockReviewItem]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].itemType).toBe('grammar');
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

describe('POST /api/review', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('records a review rating', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.reviewItem.findUnique.mockResolvedValue({
      ...mockReviewItem,
      speaker: { accountId: 'user-1' },
    });
    prismaMock.reviewItem.update.mockResolvedValue({
      ...mockReviewItem,
      reps: 1,
      state: 'Review',
      lastReview: new Date(),
      nextReview: new Date(Date.now() + 86400000),
    });

    const request = new NextRequest('http://localhost/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 'a0000000-0000-4000-a000-000000000001', rating: 3 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 400 for invalid rating', async () => {
    setAuthenticated({ id: 'user-1' });

    const request = new NextRequest('http://localhost/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 'a0000000-0000-4000-a000-000000000001', rating: 5 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 404 when item belongs to wrong user', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.reviewItem.findUnique.mockResolvedValue({
      ...mockReviewItem,
      speaker: { accountId: 'other-user' },
    });

    const request = new NextRequest('http://localhost/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 'a0000000-0000-4000-a000-000000000001', rating: 3 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });
});
