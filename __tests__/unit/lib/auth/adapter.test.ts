import { vi, describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../../mocks/prisma';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import { PrismaAdapter } from '@/lib/auth/adapter';

beforeEach(() => {
  resetPrismaMock();
});

const adapter = PrismaAdapter();

// Helper: a typical account row returned by prisma
function mockAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'user@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.png',
    emailVerified: new Date('2025-01-01'),
    isGuest: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PrismaAdapter', () => {
  describe('createUser', () => {
    it('creates an account and a default speaker, returns AdapterUser', async () => {
      const accountRow = mockAccountRow();
      prismaMock.account.create.mockResolvedValue(accountRow);
      prismaMock.speaker.create.mockResolvedValue({
        id: 's1',
        accountId: 'u1',
        label: 'Default',
      });

      const result = await adapter.createUser!({
        email: 'user@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
        id: '',
      });

      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          name: 'Test User',
          image: 'https://example.com/avatar.png',
          emailVerified: new Date('2025-01-01'),
        },
      });

      expect(prismaMock.speaker.create).toHaveBeenCalledWith({
        data: {
          accountId: 'u1',
          label: 'Default',
          languageProfile: expect.objectContaining({
            estimatedCefr: 'B1',
            confidence: 0,
          }),
        },
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'user@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
      });
    });

    it('handles null name and image gracefully', async () => {
      const accountRow = mockAccountRow({ name: null, image: null });
      prismaMock.account.create.mockResolvedValue(accountRow);
      prismaMock.speaker.create.mockResolvedValue({ id: 's1' });

      const result = await adapter.createUser!({
        email: 'user@example.com',
        name: undefined as unknown as string,
        image: undefined as unknown as string,
        emailVerified: null,
        id: '',
      });

      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          name: null,
          image: null,
          emailVerified: null,
        },
      });

      expect(result.name).toBeNull();
      expect(result.image).toBeNull();
    });
  });

  describe('getUser', () => {
    it('returns AdapterUser when account exists', async () => {
      const accountRow = mockAccountRow();
      prismaMock.account.findUnique.mockResolvedValue(accountRow);

      const result = await adapter.getUser!('u1');

      expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'user@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
      });
    });

    it('returns null when account does not exist', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      const result = await adapter.getUser!('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('returns null when email is null', async () => {
      const result = await adapter.getUserByEmail!(null as unknown as string);
      expect(result).toBeNull();
      expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    });

    it('returns AdapterUser when account found by email', async () => {
      const accountRow = mockAccountRow();
      prismaMock.account.findUnique.mockResolvedValue(accountRow);

      const result = await adapter.getUserByEmail!('user@example.com');

      expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'user@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
      });
    });

    it('returns null when no account has that email', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      const result = await adapter.getUserByEmail!('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('getUserByAccount', () => {
    it('returns AdapterUser when OAuth account found', async () => {
      const accountRow = mockAccountRow();
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa1',
        provider: 'google',
        providerAccountId: 'google-123',
        account: accountRow,
      });

      const result = await adapter.getUserByAccount!({
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
      });

      expect(prismaMock.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: 'google-123',
          },
        },
        include: { account: true },
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'user@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
      });
    });

    it('returns null when OAuth account not found', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);

      const result = await adapter.getUserByAccount!({
        provider: 'github',
        providerAccountId: 'unknown',
        type: 'oauth',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('updates and returns the user', async () => {
      const updatedRow = mockAccountRow({ name: 'Updated Name' });
      prismaMock.account.update.mockResolvedValue(updatedRow);

      const result = await adapter.updateUser!({
        id: 'u1',
        name: 'Updated Name',
      });

      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          email: undefined,
          name: 'Updated Name',
          image: undefined,
          emailVerified: undefined,
        },
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'user@example.com',
        name: 'Updated Name',
        image: 'https://example.com/avatar.png',
        emailVerified: new Date('2025-01-01'),
      });
    });
  });

  describe('linkAccount', () => {
    it('creates an OAuth account record', async () => {
      prismaMock.oAuthAccount.create.mockResolvedValue({ id: 'oa1' });

      await adapter.linkAccount!({
        userId: 'u1',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        access_token: 'access-tok',
        refresh_token: 'refresh-tok',
        expires_at: 1700000000,
        token_type: 'Bearer',
        scope: 'openid email',
        id_token: 'id-tok',
      });

      expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          accountId: 'u1',
          provider: 'google',
          providerAccountId: 'google-123',
          accessToken: 'access-tok',
          refreshToken: 'refresh-tok',
          expiresAt: 1700000000,
          tokenType: 'Bearer',
          scope: 'openid email',
          idToken: 'id-tok',
        },
      });
    });

    it('handles missing optional OAuth fields with null', async () => {
      prismaMock.oAuthAccount.create.mockResolvedValue({ id: 'oa2' });

      await adapter.linkAccount!({
        userId: 'u1',
        provider: 'github',
        providerAccountId: 'gh-456',
        type: 'oauth',
      });

      expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          accountId: 'u1',
          provider: 'github',
          providerAccountId: 'gh-456',
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          tokenType: null,
          scope: null,
          idToken: null,
        },
      });
    });
  });

  describe('createVerificationToken', () => {
    it('creates and returns a verification token', async () => {
      const tokenData = {
        identifier: 'user@example.com',
        token: 'abc-123',
        expires: new Date('2025-12-31'),
      };

      prismaMock.verificationToken.create.mockResolvedValue(tokenData);

      const result = await adapter.createVerificationToken!(tokenData);

      expect(prismaMock.verificationToken.create).toHaveBeenCalledWith({
        data: {
          identifier: 'user@example.com',
          token: 'abc-123',
          expires: new Date('2025-12-31'),
        },
      });

      expect(result).toEqual(tokenData);
    });
  });

  describe('useVerificationToken', () => {
    it('deletes and returns the verification token', async () => {
      const tokenData = {
        identifier: 'user@example.com',
        token: 'abc-123',
        expires: new Date('2025-12-31'),
      };

      prismaMock.verificationToken.delete.mockResolvedValue(tokenData);

      const result = await adapter.useVerificationToken!({
        identifier: 'user@example.com',
        token: 'abc-123',
      });

      expect(prismaMock.verificationToken.delete).toHaveBeenCalledWith({
        where: {
          identifier_token: {
            identifier: 'user@example.com',
            token: 'abc-123',
          },
        },
      });

      expect(result).toEqual(tokenData);
    });

    it('returns null when the token does not exist (delete throws)', async () => {
      prismaMock.verificationToken.delete.mockRejectedValue(
        new Error('Record not found')
      );

      const result = await adapter.useVerificationToken!({
        identifier: 'user@example.com',
        token: 'nonexistent',
      });

      expect(result).toBeNull();
    });
  });
});
