import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Edge-compatible auth config.
 * This file must NOT import prisma, bcryptjs, or any Node.js-only modules.
 * It is used by middleware (Edge Runtime) for JWT session checks.
 *
 * The full auth config with Credentials providers and adapter
 * lives in auth.ts (Node.js runtime only).
 */
export const authConfig: NextAuthConfig = {
  providers: [
    // Only declare providers that don't need Node.js APIs at config time.
    // Google is safe — it only needs env vars, no bcrypt/prisma.
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id as string;
        token.isGuest = (user as { isGuest?: boolean }).isGuest ?? false;
        token.name = user.name ?? null;
        token.image = user.image ?? null;
        token.email = user.email ?? null;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.isGuest = token.isGuest as boolean | undefined;
        session.user.name = (token.name as string | null) ?? null;
        session.user.image = (token.image as string | null) ?? null;
        (session.user as { email: string | null }).email = (token.email as string | null) ?? null;
      }
      return session;
    },

    authorized({ auth, request: { nextUrl } }) {
      const isAuthenticated = !!auth?.user;
      const isProtectedPage = nextUrl.pathname.startsWith('/profile') || nextUrl.pathname.startsWith('/review');
      const isProtectedApi = nextUrl.pathname.startsWith('/api/user/') || nextUrl.pathname.startsWith('/api/review');

      if (!isAuthenticated && isProtectedApi) {
        return Response.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (!isAuthenticated && isProtectedPage) {
        const loginUrl = new URL('/auth/login', nextUrl.origin);
        loginUrl.searchParams.set('callbackUrl', nextUrl.pathname);
        return Response.redirect(loginUrl);
      }

      return true;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
};
