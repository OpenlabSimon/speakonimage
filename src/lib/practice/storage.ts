export const CURRENT_TOPIC_STORAGE_KEY = 'currentTopic';
export const ATTEMPTS_STORAGE_KEY = 'topicAttempts';
export const DRAFT_HISTORY_STORAGE_KEY = 'topicDraftHistory';

export interface StoredCurrentTopicSummary {
  id?: string;
  type: 'translation' | 'expression';
  chinesePrompt: string;
  resumeMessage?: string;
}

export type TopicPracticeAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

export function getAttemptsStorageKey(topicId?: string): string {
  return topicId ? `${ATTEMPTS_STORAGE_KEY}:${topicId}` : ATTEMPTS_STORAGE_KEY;
}

export function getDraftHistoryStorageKey(topicId?: string): string {
  return topicId ? `${DRAFT_HISTORY_STORAGE_KEY}:${topicId}` : DRAFT_HISTORY_STORAGE_KEY;
}

export function shouldClearAnonymousPracticeStorage(topicId?: string): boolean {
  return !topicId;
}

export function loadCurrentTopicSummary(): StoredCurrentTopicSummary | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(CURRENT_TOPIC_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredCurrentTopicSummary;
    if (!parsed || !parsed.type || !parsed.chinesePrompt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function buildTopicPracticeCallbackUrl(topicId: string): string {
  return `/topic/practice?topicId=${topicId}`;
}

export function buildTopicPracticeLoginRedirect(topicId: string): string {
  return `/auth/login?callbackUrl=${encodeURIComponent(buildTopicPracticeCallbackUrl(topicId))}`;
}

export function resolveTopicPracticeLoadAction(
  authStatus: TopicPracticeAuthStatus,
  requestedTopicId: string | null
): { kind: 'wait' | 'continue' | 'redirect'; redirectTo?: string } {
  if (!requestedTopicId) {
    return { kind: 'continue' };
  }

  if (authStatus === 'loading') {
    return { kind: 'wait' };
  }

  if (authStatus === 'unauthenticated') {
    return {
      kind: 'redirect',
      redirectTo: buildTopicPracticeLoginRedirect(requestedTopicId),
    };
  }

  return { kind: 'continue' };
}
