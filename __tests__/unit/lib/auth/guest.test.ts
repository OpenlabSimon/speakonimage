import { vi, describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../../mocks/prisma';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

import {
  createGuestAccount,
  upgradeGuestAccount,
  cleanupExpiredGuests,
  isGuestAccount,
} from '@/lib/auth/guest';

beforeEach(() => {
  resetPrismaMock();
});

describe('createGuestAccount', () => {
  it('creates an account and speaker, returns user with isGuest true', async () => {
    const mockAccount = {
      id: 'g1',
      email: null,
      name: null,
      image: null,
      isGuest: true,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.account.create.mockResolvedValue(mockAccount);
    prismaMock.speaker.create.mockResolvedValue({
      id: 's1',
      accountId: 'g1',
      label: 'Default',
    });

    const result = await createGuestAccount();

    expect(prismaMock.account.create).toHaveBeenCalledWith({
      data: {
        isGuest: true,
        settings: {},
      },
    });

    expect(prismaMock.speaker.create).toHaveBeenCalledWith({
      data: {
        accountId: 'g1',
        label: 'Default',
        languageProfile: expect.objectContaining({
          estimatedCefr: 'B1',
          confidence: 0,
        }),
      },
    });

    expect(result).toEqual({
      id: 'g1',
      email: null,
      name: null,
      image: null,
      isGuest: true,
    });
  });
});

describe('upgradeGuestAccount', () => {
  it('upgrades a guest account with email and password', async () => {
    const guestAccount = {
      id: 'g1',
      email: null,
      name: null,
      image: null,
      isGuest: true,
      emailVerified: null,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedAccount = {
      ...guestAccount,
      email: 'user@example.com',
      isGuest: false,
      settings: { password: 'hashed-password' },
    };

    // First findUnique: look up the account by id
    prismaMock.account.findUnique.mockResolvedValueOnce(guestAccount);
    // Second findUnique: check if email is taken
    prismaMock.account.findUnique.mockResolvedValueOnce(null);
    prismaMock.account.update.mockResolvedValue(updatedAccount);

    const result = await upgradeGuestAccount('g1', {
      email: 'user@example.com',
      password: 'plaintext-password',
    });

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: {
        email: 'user@example.com',
        isGuest: false,
        settings: { password: 'hashed-password' },
      },
    });

    expect(result).toEqual({
      id: 'g1',
      email: 'user@example.com',
      name: null,
      image: null,
      isGuest: false,
    });
  });

  it('throws if account is not a guest', async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce({
      id: 'g1',
      email: 'existing@example.com',
      name: null,
      image: null,
      isGuest: false,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      upgradeGuestAccount('g1', {
        email: 'new@example.com',
        password: 'password',
      })
    ).rejects.toThrow('Account is not a guest account');
  });

  it('throws if account is not found', async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(null);

    await expect(
      upgradeGuestAccount('nonexistent', {
        email: 'new@example.com',
        password: 'password',
      })
    ).rejects.toThrow('Account is not a guest account');
  });

  it('throws if email is already taken', async () => {
    const guestAccount = {
      id: 'g1',
      email: null,
      name: null,
      image: null,
      isGuest: true,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingAccount = {
      id: 'other-id',
      email: 'taken@example.com',
      name: 'Other User',
      image: null,
      isGuest: false,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // First findUnique: look up the guest account
    prismaMock.account.findUnique.mockResolvedValueOnce(guestAccount);
    // Second findUnique: email already taken
    prismaMock.account.findUnique.mockResolvedValueOnce(existingAccount);

    await expect(
      upgradeGuestAccount('g1', {
        email: 'taken@example.com',
        password: 'password',
      })
    ).rejects.toThrow('Email is already in use');
  });
});

describe('cleanupExpiredGuests', () => {
  it('deletes guest accounts older than the default 30 days', async () => {
    prismaMock.account.deleteMany.mockResolvedValue({ count: 5 });

    const result = await cleanupExpiredGuests();

    expect(result).toBe(5);
    expect(prismaMock.account.deleteMany).toHaveBeenCalledWith({
      where: {
        isGuest: true,
        createdAt: { lt: expect.any(Date) },
      },
    });
  });

  it('accepts a custom maxAgeDays parameter', async () => {
    prismaMock.account.deleteMany.mockResolvedValue({ count: 2 });

    const result = await cleanupExpiredGuests(7);

    expect(result).toBe(2);
    expect(prismaMock.account.deleteMany).toHaveBeenCalledWith({
      where: {
        isGuest: true,
        createdAt: { lt: expect.any(Date) },
      },
    });
  });
});

describe('isGuestAccount', () => {
  it('returns true when account is a guest', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ isGuest: true });

    const result = await isGuestAccount('g1');
    expect(result).toBe(true);

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'g1' },
      select: { isGuest: true },
    });
  });

  it('returns false when account is not a guest', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ isGuest: false });

    const result = await isGuestAccount('u1');
    expect(result).toBe(false);
  });

  it('returns false when account is not found', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);

    const result = await isGuestAccount('nonexistent');
    expect(result).toBe(false);
  });
});
