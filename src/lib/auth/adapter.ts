import type { Adapter, AdapterUser, AdapterAccount } from 'next-auth/adapters';
import { prisma } from '@/lib/db';

/**
 * Custom NextAuth adapter that maps NextAuth's User/Account vocabulary
 * to our Account/OAuthAccount models.
 */
export function PrismaAdapter(): Adapter {
  return {
    async createUser(data) {
      const user = await prisma.account.create({
        data: {
          email: data.email,
          name: data.name ?? null,
          image: data.image ?? null,
          emailVerified: data.emailVerified ?? null,
        },
      });

      // Auto-create default Speaker for new OAuth users
      await prisma.speaker.create({
        data: {
          accountId: user.id,
          label: 'Default',
          languageProfile: {
            estimatedCefr: 'B1',
            confidence: 0,
            lastUpdated: new Date().toISOString(),
          },
        },
      });

      return toAdapterUser(user);
    },

    async getUser(id) {
      const user = await prisma.account.findUnique({ where: { id } });
      if (!user) return null;
      return toAdapterUser(user);
    },

    async getUserByEmail(email) {
      if (!email) return null;
      const user = await prisma.account.findUnique({ where: { email } });
      if (!user) return null;
      return toAdapterUser(user);
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const oauthAccount = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: { provider, providerAccountId },
        },
        include: { account: true },
      });
      if (!oauthAccount) return null;
      return toAdapterUser(oauthAccount.account);
    },

    async updateUser(data) {
      const user = await prisma.account.update({
        where: { id: data.id },
        data: {
          email: data.email ?? undefined,
          name: data.name ?? undefined,
          image: data.image ?? undefined,
          emailVerified: data.emailVerified ?? undefined,
        },
      });
      return toAdapterUser(user);
    },

    async linkAccount(data: AdapterAccount) {
      await prisma.oAuthAccount.create({
        data: {
          accountId: data.userId,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
          accessToken: data.access_token ?? null,
          refreshToken: data.refresh_token ?? null,
          expiresAt: data.expires_at ?? null,
          tokenType: data.token_type ?? null,
          scope: data.scope ?? null,
          idToken: data.id_token ?? null,
        },
      });
    },

    async createVerificationToken(data) {
      const token = await prisma.verificationToken.create({
        data: {
          identifier: data.identifier,
          token: data.token,
          expires: data.expires,
        },
      });
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      try {
        const result = await prisma.verificationToken.delete({
          where: {
            identifier_token: { identifier, token },
          },
        });
        return result;
      } catch {
        return null;
      }
    },
  };
}

type AccountRow = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
  isGuest: boolean;
};

function toAdapterUser(user: AccountRow): AdapterUser {
  return {
    id: user.id,
    email: user.email ?? '',
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
  };
}
