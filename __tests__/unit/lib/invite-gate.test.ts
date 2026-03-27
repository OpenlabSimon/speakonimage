import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInviteRedirectTarget,
  getInviteCookieName,
  getInviteTokens,
  isInviteAccessAllowed,
  isInviteGateEnabled,
  isInvitePublicPath,
  isValidInviteToken,
} from '@/lib/invite-gate';

const originalEnv = {
  INVITE_GATE_ENABLED: process.env.INVITE_GATE_ENABLED,
  INVITE_GATE_TOKENS: process.env.INVITE_GATE_TOKENS,
  INVITE_GATE_COOKIE_NAME: process.env.INVITE_GATE_COOKIE_NAME,
  INVITE_GATE_ACCESS_PATH: process.env.INVITE_GATE_ACCESS_PATH,
};

afterEach(() => {
  process.env.INVITE_GATE_ENABLED = originalEnv.INVITE_GATE_ENABLED;
  process.env.INVITE_GATE_TOKENS = originalEnv.INVITE_GATE_TOKENS;
  process.env.INVITE_GATE_COOKIE_NAME = originalEnv.INVITE_GATE_COOKIE_NAME;
  process.env.INVITE_GATE_ACCESS_PATH = originalEnv.INVITE_GATE_ACCESS_PATH;
});

describe('invite gate helpers', () => {
  it('parses comma-separated invite tokens', () => {
    process.env.INVITE_GATE_TOKENS = 'alpha,beta,gamma';

    expect(getInviteTokens()).toEqual(['alpha', 'beta', 'gamma']);
    expect(isValidInviteToken('beta')).toBe(true);
    expect(isValidInviteToken('delta')).toBe(false);
  });

  it('treats gate as open when disabled', () => {
    process.env.INVITE_GATE_ENABLED = 'false';

    expect(isInviteGateEnabled()).toBe(false);
    expect(isInviteAccessAllowed(null)).toBe(true);
  });

  it('requires a valid cookie token when enabled', () => {
    process.env.INVITE_GATE_ENABLED = 'true';
    process.env.INVITE_GATE_TOKENS = 'friend-a';

    expect(isInviteAccessAllowed('friend-a')).toBe(true);
    expect(isInviteAccessAllowed('friend-b')).toBe(false);
  });

  it('normalizes invalid redirect targets back to root', () => {
    expect(buildInviteRedirectTarget('/topic/practice?resume=1')).toBe('/topic/practice?resume=1');
    expect(buildInviteRedirectTarget('https://evil.example')).toBe('/');
    expect(buildInviteRedirectTarget('/invite/alpha')).toBe('/');
  });

  it('recognizes public invite paths and custom cookie name', () => {
    process.env.INVITE_GATE_COOKIE_NAME = 'dopling_beta';
    process.env.INVITE_GATE_ACCESS_PATH = '/beta/access';

    expect(getInviteCookieName()).toBe('dopling_beta');
    expect(isInvitePublicPath('/beta/access')).toBe(true);
    expect(isInvitePublicPath('/invite/friend-a')).toBe(true);
    expect(isInvitePublicPath('/topic/practice')).toBe(false);
  });
});
