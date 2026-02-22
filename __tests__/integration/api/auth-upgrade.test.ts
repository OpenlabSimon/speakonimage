import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  checkAuth: vi.fn(),
  getCurrentUser: vi.fn(),
  unauthorizedResponse: vi.fn(),
}));
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));
vi.mock('@/lib/auth/guest', () => ({
  upgradeGuestAccount: vi.fn(),
}));

import { POST } from '@/app/api/auth/upgrade/route';
import { upgradeGuestAccount } from '@/lib/auth/guest';

describe('POST /api/auth/upgrade', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    vi.mocked(upgradeGuestAccount).mockReset();
  });

  it('upgrades a guest account successfully', async () => {
    setAuthenticated({ id: 'guest-1', email: null, isGuest: true });
    // Override auth mock to include isGuest on session.user
    mockAuth.mockResolvedValue({ user: { id: 'guest-1', email: null, isGuest: true } });

    vi.mocked(upgradeGuestAccount).mockResolvedValue({
      id: 'guest-1',
      email: 'user@example.com',
      name: null,
      image: null,
      isGuest: false,
    });

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.email).toBe('user@example.com');
    expect(data.data.isGuest).toBe(false);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns 400 when account is not a guest', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'a@b.com', isGuest: false } });

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('not a guest');
  });

  it('returns 400 when email/password missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'guest-1', isGuest: true } });

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 400 when password too short', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'guest-1', isGuest: true } });

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: '12345' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('at least 6');
  });

  it('returns 400 when email is already taken', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'guest-1', isGuest: true } });

    vi.mocked(upgradeGuestAccount).mockRejectedValue(new Error('Email is already in use'));

    const request = new Request('http://localhost/api/auth/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'taken@example.com', password: 'password123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('already in use');
  });
});
