import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ReviewPreference, TeacherSelection } from './types';
import { getAuthSecret } from '@/lib/auth/secret';

interface ReviewAudioTokenPayload {
  teacher: TeacherSelection;
  review: ReviewPreference;
  speechScript: string;
  sessionId?: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getSigningSecret(): string | null {
  return process.env.REVIEW_AUDIO_SIGNING_SECRET || getAuthSecret() || null;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signEncodedPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createReviewAudioToken(
  input: Omit<ReviewAudioTokenPayload, 'expiresAt'>,
  ttlMs = DEFAULT_TTL_MS
): string | undefined {
  const secret = getSigningSecret();
  if (!secret) return undefined;

  const payload: ReviewAudioTokenPayload = {
    ...input,
    expiresAt: Date.now() + ttlMs,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyReviewAudioToken(token: string): ReviewAudioTokenPayload | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = signEncodedPayload(encodedPayload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as ReviewAudioTokenPayload;
    if (!payload?.speechScript || !payload?.teacher?.soulId || !payload?.review?.mode) {
      return null;
    }
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function hasReviewAudioSigningSecret(): boolean {
  return Boolean(getSigningSecret());
}
