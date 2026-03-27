import { NextResponse } from 'next/server';
import {
  buildInviteRedirectTarget,
  getInviteCookieName,
  getInviteTokens,
  isInviteGateEnabled,
  isValidInviteToken,
} from '@/lib/invite-gate';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const next = buildInviteRedirectTarget(url.searchParams.get('next'));

  if (!isInviteGateEnabled()) {
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (!getInviteTokens().length || !isValidInviteToken(token)) {
    return NextResponse.redirect(new URL(`/beta/access?error=invalid&next=${encodeURIComponent(next)}`, request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(getInviteCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
