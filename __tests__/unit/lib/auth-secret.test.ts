import { afterEach, describe, expect, it } from 'vitest';
import { getAuthSecret, getLocalDevAuthSecret } from '@/lib/auth/secret';

const ORIGINAL_ENV = { ...process.env };

describe('getAuthSecret', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns configured AUTH_SECRET when present', () => {
    process.env.AUTH_SECRET = 'configured-secret';
    process.env.NEXTAUTH_SECRET = '';
    process.env.NODE_ENV = 'development';

    expect(getAuthSecret()).toBe('configured-secret');
  });

  it('falls back to local dev secret outside production', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = 'development';

    expect(getAuthSecret()).toBe(getLocalDevAuthSecret());
  });

  it('does not invent a secret in production', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = 'production';

    expect(getAuthSecret()).toBeUndefined();
  });
});
