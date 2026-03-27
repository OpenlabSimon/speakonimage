const DEFAULT_COOKIE_NAME = 'speakonimage_invite';
const DEFAULT_ACCESS_PATH = '/beta/access';

function splitTokens(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isInviteGateEnabled(): boolean {
  const rawValue = process.env.INVITE_GATE_ENABLED?.trim().toLowerCase();
  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  return process.env.VERCEL_ENV === 'production';
}

export function getInviteCookieName(): string {
  return process.env.INVITE_GATE_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
}

export function getInviteAccessPath(): string {
  return process.env.INVITE_GATE_ACCESS_PATH?.trim() || DEFAULT_ACCESS_PATH;
}

export function getInviteTokens(): string[] {
  return splitTokens(process.env.INVITE_GATE_TOKENS || '');
}

export function isValidInviteToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return getInviteTokens().includes(token.trim());
}

export function isInviteAccessAllowed(cookieValue: string | null | undefined): boolean {
  if (!isInviteGateEnabled()) {
    return true;
  }

  return isValidInviteToken(cookieValue);
}

export function buildInviteRedirectTarget(nextPath: string | null | undefined): string {
  if (!nextPath || !nextPath.startsWith('/')) {
    return '/';
  }

  if (nextPath.startsWith('/invite/') || nextPath.startsWith(getInviteAccessPath())) {
    return '/';
  }

  return nextPath;
}

export function isInvitePublicPath(pathname: string): boolean {
  const accessPath = getInviteAccessPath();

  return (
    pathname === accessPath ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/api/invite/claim') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image') ||
    pathname.startsWith('/vercel.svg')
  );
}
