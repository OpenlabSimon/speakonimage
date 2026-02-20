import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' }, // 'login' or 'register'
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const action = credentials.action as string || 'login';

        if (action === 'register') {
          // Check if user exists
          const existingUser = await prisma.account.findUnique({
            where: { email },
          });

          if (existingUser) {
            throw new Error('User already exists');
          }

          // Hash password and create user
          const hashedPassword = await hash(password, 12);

          const newUser = await prisma.account.create({
            data: {
              email,
              settings: { password: hashedPassword },
            },
          });

          // Create default speaker for the user
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
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
