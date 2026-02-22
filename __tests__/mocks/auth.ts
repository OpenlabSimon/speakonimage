import { vi } from 'vitest';

export const mockAuth = vi.fn();
export const mockCheckAuth = vi.fn();
export const mockGetCurrentUser = vi.fn();

// Helper to set authenticated state
export function setAuthenticated(user: { id: string; email?: string | null; isGuest?: boolean }) {
  mockAuth.mockResolvedValue({ user });
  mockCheckAuth.mockResolvedValue({ authenticated: true, user });
  mockGetCurrentUser.mockResolvedValue(user);
}

// Helper to set unauthenticated state
export function setUnauthenticated() {
  mockAuth.mockResolvedValue(null);
  mockCheckAuth.mockResolvedValue({ authenticated: false, user: null });
  mockGetCurrentUser.mockResolvedValue(undefined);
}

export function resetAuthMock() {
  mockAuth.mockReset();
  mockCheckAuth.mockReset();
  mockGetCurrentUser.mockReset();
}
