import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => ({
    generateJSON: vi.fn().mockResolvedValue({
      summary: 'Test summary',
      keyPoints: [],
      mainTopics: [],
      notableErrors: [],
      vocabulary: [],
    }),
    generateText: vi.fn(),
    name: 'MockLLM',
  }),
}));
vi.mock('@/lib/memory/SessionExtractor', () => ({
  extractSessionLearningData: vi.fn().mockResolvedValue({
    sessionSummary: 'Test session',
    newVocabulary: [],
    errors: [],
    grammarPointsTouched: [],
    topicsDiscussed: [],
    suggestedFocusNext: [],
    overallProgress: 'stable',
  }),
}));
vi.mock('@/lib/profile/ProfileManager', () => ({
  computeAndUpdateProfile: vi.fn().mockResolvedValue({}),
}));

import {
  createSession,
  addMessage,
  endSession,
  getOrCreateSessionForTopic,
} from '@/lib/memory/ConversationManager';

const mockSessionRow = {
  id: 'session-1',
  accountId: 'user-1',
  speakerId: null,
  topicId: null,
  sessionType: 'practice',
  status: 'active',
  startedAt: new Date(),
  endedAt: null,
  messageCount: 0,
  contextSummary: null,
  extractedData: null,
};

describe('createSession', () => {
  beforeEach(() => resetPrismaMock());

  it('creates a new session', async () => {
    prismaMock.chatSession.create.mockResolvedValue(mockSessionRow);

    const session = await createSession({
      accountId: 'user-1',
      sessionType: 'practice',
    });

    expect(session.id).toBe('session-1');
    expect(session.status).toBe('active');
    expect(prismaMock.chatSession.create).toHaveBeenCalledOnce();
  });
});

describe('addMessage', () => {
  beforeEach(() => resetPrismaMock());

  it('creates message and increments count', async () => {
    prismaMock.chatMessage.create.mockResolvedValue({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello',
      contentType: 'text',
      metadata: null,
      createdAt: new Date(),
    });
    prismaMock.chatSession.update.mockResolvedValue({});

    const msg = await addMessage({
      sessionId: 'session-1',
      role: 'user',
      content: 'Hello',
    });

    expect(msg.id).toBe('msg-1');
    expect(msg.content).toBe('Hello');
    expect(prismaMock.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { messageCount: { increment: 1 } },
      })
    );
  });
});

describe('endSession', () => {
  beforeEach(() => resetPrismaMock());

  it('ends session and triggers extraction', async () => {
    prismaMock.chatSession.findUnique.mockResolvedValue({
      ...mockSessionRow,
      messageCount: 3,
    });
    prismaMock.chatMessage.findMany.mockResolvedValue([
      { id: 'msg-1', sessionId: 'session-1', role: 'user', content: 'test', contentType: 'text', metadata: null, createdAt: new Date() },
    ]);
    prismaMock.chatSession.update.mockResolvedValue({
      ...mockSessionRow,
      status: 'ended',
      endedAt: new Date(),
    });

    const session = await endSession('session-1');

    expect(session.status).toBe('ended');
    expect(prismaMock.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ended' }),
      })
    );
  });

  it('returns existing session if already ended', async () => {
    prismaMock.chatSession.findUnique.mockResolvedValue({
      ...mockSessionRow,
      status: 'ended',
      endedAt: new Date(),
    });

    const session = await endSession('session-1');

    expect(session.status).toBe('ended');
    expect(prismaMock.chatSession.update).not.toHaveBeenCalled();
  });
});

describe('getOrCreateSessionForTopic', () => {
  beforeEach(() => resetPrismaMock());

  it('returns existing active session', async () => {
    prismaMock.chatSession.findFirst.mockResolvedValue({
      ...mockSessionRow,
      topicId: 'topic-1',
    });

    const session = await getOrCreateSessionForTopic('user-1', 'topic-1');

    expect(session.id).toBe('session-1');
    expect(prismaMock.chatSession.create).not.toHaveBeenCalled();
  });

  it('creates new session when no active exists', async () => {
    prismaMock.chatSession.findFirst.mockResolvedValue(null);
    prismaMock.chatSession.create.mockResolvedValue({
      ...mockSessionRow,
      topicId: 'topic-1',
    });

    const session = await getOrCreateSessionForTopic('user-1', 'topic-1');

    expect(session.id).toBe('session-1');
    expect(prismaMock.chatSession.create).toHaveBeenCalledOnce();
  });
});
