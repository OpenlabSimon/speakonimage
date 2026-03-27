import { NextResponse } from 'next/server';
import {
  buildInviteRedirectTarget,
  getInviteCookieName,
  isInviteGateEnabled,
  isValidInviteToken,
} from '@/lib/invite-gate';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    next?: string;
  } | null;
  const token = body?.token?.trim();
  const next = buildInviteRedirectTarget(body?.next);

  if (!isInviteGateEnabled()) {
    return NextResponse.json({
      success: true,
      redirectTo: next,
    });
  }

  if (!isValidInviteToken(token)) {
    return NextResponse.json(
      {
        success: false,
        error: '邀请码无效',
      },
      { status: 403 }
    );
  }

  const inviteToken = token!;
  const response = NextResponse.json({
    success: true,
    redirectTo: next,
  });

  response.cookies.set(getInviteCookieName(), inviteToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
