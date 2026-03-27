import { NextRequest, NextResponse } from 'next/server';
import {
  buildInviteRedirectTarget,
  getInviteAccessPath,
  getInviteCookieName,
  isInviteAccessAllowed,
  isInviteGateEnabled,
  isInvitePublicPath,
} from '@/lib/invite-gate';

export function proxy(request: NextRequest) {
  const { nextUrl } = request;

  if (!isInviteGateEnabled() || isInvitePublicPath(nextUrl.pathname)) {
    return NextResponse.next();
  }

  const inviteCookie = request.cookies.get(getInviteCookieName())?.value;
  if (isInviteAccessAllowed(inviteCookie)) {
    return NextResponse.next();
  }

  if (nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invite required',
      },
      { status: 403 }
    );
  }

  const redirectUrl = new URL(getInviteAccessPath(), nextUrl);
  redirectUrl.searchParams.set(
    'next',
    buildInviteRedirectTarget(`${nextUrl.pathname}${nextUrl.search}`)
  );
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
};
