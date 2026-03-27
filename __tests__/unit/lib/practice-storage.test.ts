import {
  ATTEMPTS_STORAGE_KEY,
  CURRENT_TOPIC_STORAGE_KEY,
  DRAFT_HISTORY_STORAGE_KEY,
  buildTopicPracticeCallbackUrl,
  buildTopicPracticeLoginRedirect,
  getAttemptsStorageKey,
  getDraftHistoryStorageKey,
  resolveTopicPracticeLoadAction,
  shouldClearAnonymousPracticeStorage,
} from '@/lib/practice/storage';

describe('practice storage helpers', () => {
  it('uses legacy keys for anonymous practice state', () => {
    expect(getAttemptsStorageKey()).toBe(ATTEMPTS_STORAGE_KEY);
    expect(getDraftHistoryStorageKey()).toBe(DRAFT_HISTORY_STORAGE_KEY);
  });

  it('namespaces keys for persisted topics', () => {
    expect(getAttemptsStorageKey('topic-1')).toBe('topicAttempts:topic-1');
    expect(getDraftHistoryStorageKey('topic-1')).toBe('topicDraftHistory:topic-1');
  });

  it('marks anonymous topics for storage clearing', () => {
    expect(shouldClearAnonymousPracticeStorage()).toBe(true);
    expect(shouldClearAnonymousPracticeStorage(undefined)).toBe(true);
    expect(shouldClearAnonymousPracticeStorage('topic-1')).toBe(false);
  });

  it('builds callback url for topic deep links', () => {
    expect(buildTopicPracticeCallbackUrl('topic-1')).toBe('/topic/practice?topicId=topic-1');
    expect(buildTopicPracticeLoginRedirect('topic-1')).toBe(
      `/auth/login?callbackUrl=${encodeURIComponent('/topic/practice?topicId=topic-1')}`
    );
  });

  it('continues normally when there is no requested topic id', () => {
    expect(resolveTopicPracticeLoadAction('unauthenticated', null)).toEqual({
      kind: 'continue',
    });
  });

  it('waits for auth when deep-link topic is still resolving', () => {
    expect(resolveTopicPracticeLoadAction('loading', 'topic-1')).toEqual({
      kind: 'wait',
    });
  });

  it('redirects unauthenticated deep links to login with callback', () => {
    expect(resolveTopicPracticeLoadAction('unauthenticated', 'topic-1')).toEqual({
      kind: 'redirect',
      redirectTo: `/auth/login?callbackUrl=${encodeURIComponent('/topic/practice?topicId=topic-1')}`,
    });
  });

  it('continues for authenticated deep links', () => {
    expect(resolveTopicPracticeLoadAction('authenticated', 'topic-1')).toEqual({
      kind: 'continue',
    });
  });

  it('keeps current topic key stable', () => {
    expect(CURRENT_TOPIC_STORAGE_KEY).toBe('currentTopic');
  });
});
