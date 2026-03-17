import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, resetAuthMock, setAuthenticated, setUnauthenticated } from '../../mocks/auth';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
}));

import { GET, PATCH } from '@/app/api/user/coach-preferences/route';

describe('GET/PATCH /api/user/coach-preferences', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
  });

  it('returns unauthorized for anonymous request', async () => {
    setUnauthenticated();

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns normalized preferences from account settings', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });
    prismaMock.account.findUnique.mockResolvedValue({
      settings: {
        password: 'hashed-password',
        coachPreferences: {
          reviewMode: 'all',
          autoPlayAudio: true,
          characterId: 'ryan',
          voiceId: 'AbCdEfGhIjKlMnOpQr12',
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      reviewMode: 'all',
      autoPlayAudio: true,
      characterId: 'ryan',
      voiceId: 'AbCdEfGhIjKlMnOpQr12',
    });
  });

  it('patches coach preferences without overwriting other settings', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });
    prismaMock.account.findUnique.mockResolvedValue({
      settings: {
        password: 'hashed-password',
        theme: 'warm',
        coachPreferences: {
          reviewMode: 'text',
          autoPlayAudio: false,
          characterId: 'mei',
        },
      },
    });
    prismaMock.account.update.mockResolvedValue({
      settings: {
        password: 'hashed-password',
        theme: 'warm',
        coachPreferences: {
          reviewMode: 'audio',
          autoPlayAudio: true,
          characterId: 'thornberry',
          voiceId: 'ZyXwVuTsRqPoNmLkJi34',
        },
      },
    });

    const request = new Request('http://localhost/api/user/coach-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewMode: 'audio',
        autoPlayAudio: true,
        characterId: 'thornberry',
        voiceId: 'ZyXwVuTsRqPoNmLkJi34',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        settings: {
          password: 'hashed-password',
          theme: 'warm',
          coachPreferences: {
            reviewMode: 'audio',
            autoPlayAudio: true,
            characterId: 'thornberry',
            voiceId: 'ZyXwVuTsRqPoNmLkJi34',
          },
        },
      },
      select: { settings: true },
    });
    expect(data.data).toEqual({
      reviewMode: 'audio',
      autoPlayAudio: true,
      characterId: 'thornberry',
      voiceId: 'ZyXwVuTsRqPoNmLkJi34',
    });
  });

  it('rejects invalid voiceId format', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });

    const request = new Request('http://localhost/api/user/coach-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceId: 'bad-voice-id',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });
});
