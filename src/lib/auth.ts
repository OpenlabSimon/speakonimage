import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { PrismaAdapter } from '@/lib/auth/adapter';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(),
  providers: [
    // Email/password login + register
    Credentials({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const action = (credentials.action as string) || 'login';

        if (action === 'register') {
          const existingUser = await prisma.account.findUnique({
            where: { email },
          });

          if (existingUser) {
            throw new Error('User already exists');
          }

          const hashedPassword = await hash(password, 12);

          const newUser = await prisma.account.create({
            data: {
              email,
              settings: { password: hashedPassword },
            },
          });

          // Create default speaker
          await prisma.speaker.create({
            data: {
              accountId: newUser.id,
              label: 'Default',
              languageProfile: {
                estimatedCefr: 'B1',
                confidence: 0,
                lastUpdated: new Date().toISOString(),
              },
            },
          });

          return {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            image: newUser.image,
            isGuest: false,
          };
        }

        // Login flow
        const user = await prisma.account.findUnique({
          where: { email },
        });

        if (!user) {
          throw new Error('Invalid email or password');
        }

        const settings = user.settings as { password?: string } | null;
        const storedPassword = settings?.password;

        if (!storedPassword) {
          throw new Error('Invalid email or password');
        }

        const isValid = await compare(password, storedPassword);

        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isGuest: user.isGuest,
        };
      },
    }),

    // Anonymous guest login
    Credentials({
      id: 'anonymous',
      name: 'anonymous',
      credentials: {},
      async authorize() {
        const guest = await prisma.account.create({
          data: {
            isGuest: true,
            settings: {},
          },
        });

        // Create default speaker for guest
        await prisma.speaker.create({
          data: {
            accountId: guest.id,
            label: 'Default',
            languageProfile: {
              estimatedCefr: 'B1',
              confidence: 0,
              lastUpdated: new Date().toISOString(),
            },
          },
        });

        return {
          id: guest.id,
          email: null,
          name: null,
          image: null,
          isGuest: true,
        };
      },
    }),

    // Google OAuth — also in authConfig for Edge, repeated here to merge
    ...authConfig.providers,
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Always allow credentials and anonymous
      if (account?.provider === 'credentials' || account?.provider === 'anonymous') {
        return true;
      }

      // For OAuth providers: auto-link to existing Account by email
      if (account && user.email) {
        const existingAccount = await prisma.account.findUnique({
          where: { email: user.email },
        });

        if (existingAccount) {
          // Check if this OAuth provider is already linked
          const existingLink = await prisma.oAuthAccount.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });

          if (!existingLink) {
            // Auto-link the OAuth account to existing user
            await prisma.oAuthAccount.create({
              data: {
                accountId: existingAccount.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                accessToken: account.access_token ?? null,
                refreshToken: account.refresh_token ?? null,
                expiresAt: account.expires_at ?? null,
                tokenType: account.token_type ?? null,
                scope: account.scope ?? null,
                idToken: account.id_token ?? null,
              },
            });
          }

          // Update name/image if not set
          if (!existingAccount.name || !existingAccount.image) {
            await prisma.account.update({
              where: { id: existingAccount.id },
              data: {
                name: existingAccount.name || user.name,
                image: existingAccount.image || user.image,
                emailVerified: existingAccount.emailVerified || new Date(),
              },
            });
          }
        }
      }

      return true;
    },
  },
});

/**
 * Get the current user session from server components/actions
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Authentication result type for API routes
 */
export type AuthResult =
  | { authenticated: true; user: { id: string; email?: string | null; isGuest?: boolean } }
  | { authenticated: false; user: null };

/**
 * Check authentication for API routes - returns result instead of throwing
 */
export async function checkAuth(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user || !user.id) {
    return { authenticated: false, user: null };
  }
  return { authenticated: true, user: { id: user.id, email: user.email, isGuest: user.isGuest } };
}

/**
 * Create unauthorized response for API routes
 */
export function unauthorizedResponse(message = 'Authentication required') {
  return Response.json(
    { success: false, error: message },
    { status: 401 }
  );
}
