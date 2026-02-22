import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';

/**
 * Create a guest account with a default Speaker
 */
export async function createGuestAccount() {
  const guest = await prisma.account.create({
    data: {
      isGuest: true,
      settings: {},
    },
  });

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
}

/**
 * Upgrade a guest account to a full account with email/password
 */
export async function upgradeGuestAccount(
  accountId: string,
  data: { email: string; password: string }
) {
  // Verify it's actually a guest account
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.isGuest) {
    throw new Error('Account is not a guest account');
  }

  // Check if email is already taken
  const existing = await prisma.account.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw new Error('Email is already in use');
  }

  const hashedPassword = await hash(data.password, 12);

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: {
      email: data.email,
      isGuest: false,
      settings: { password: hashedPassword },
    },
  });

  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    image: updated.image,
    isGuest: false,
  };
}

/**
 * Delete guest accounts older than maxAgeDays
 */
export async function cleanupExpiredGuests(maxAgeDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const result = await prisma.account.deleteMany({
    where: {
      isGuest: true,
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}

/**
 * Check if an account is a guest
 */
export async function isGuestAccount(accountId: string): Promise<boolean> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { isGuest: true },
  });
  return account?.isGuest ?? false;
}
