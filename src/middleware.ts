import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// Use the Edge-safe auth config (no prisma, no bcryptjs).
// The `authorized` callback in authConfig handles the auth checks.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    '/profile/:path*',
    '/review/:path*',
    '/api/user/:path*',
    '/api/review/:path*',
  ],
};
