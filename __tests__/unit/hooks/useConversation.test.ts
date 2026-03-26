// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConversation } from '@/hooks/useConversation';

function createSession(id: string) {
  return {
    id,
    accountId: 'user-1',
    topicId: 'topic-1',
    sessionType: 'practice' as const,
    status: 'active' as const,
    startedAt: new Date().toISOString(),
    messageCount: 0,
  };
}

function createMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
  return {
    id: `${sessionId}-${role}-1`,
    sessionId,
    role,
    content,
    contentType: 'text' as const,
    metadata: { source: 'live_coach' as const, inputMethod: 'voice' as const },
    createdAt: new Date().toISOString(),
  };
}

describe('useConversation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not mutate the current session state when persisting to a different session id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: createSession('session-current') }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: createMessage('session-other', 'user', 'Late live turn') }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversation({ isAuthenticated: true }));

    await act(async () => {
      await result.current.startSession('topic-1');
    });

    expect(result.current.session?.id).toBe('session-current');
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      const message = await result.current.addUserMessageToSession('session-other', 'Late live turn', {
        source: 'live_coach',
        inputMethod: 'voice',
      });
      expect(message?.sessionId).toBe('session-other');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.session?.messageCount).toBe(0);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/sessions/session-other/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('keeps local state in sync when the explicit target matches the current session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: createSession('session-current') }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: createMessage('session-current', 'assistant', 'Teacher reply'),
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversation({ isAuthenticated: true }));

    await act(async () => {
      await result.current.startSession('topic-1');
    });

    await act(async () => {
      await result.current.addAssistantMessageToSession('session-current', 'Teacher reply', {
        source: 'live_coach',
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.content).toBe('Teacher reply');
    expect(result.current.session?.messageCount).toBe(1);
  });
});
