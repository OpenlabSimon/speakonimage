import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationEval from '../../mocks/fixtures/evaluation-translation.json';
import expressionEval from '../../mocks/fixtures/evaluation-expression.json';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  checkAuth: (...args: unknown[]) => mockCheckAuth(...args),
  unauthorizedResponse: (msg = 'Authentication required') =>
    Response.json({ success: false, error: msg }, { status: 401 }),
  auth: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));
vi.mock('@/lib/memory/ConversationManager', () => ({
  getOrCreateSessionForTopic: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
}));
vi.mock('@/lib/profile/ProfileInjector', () => ({
  buildProfileContext: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/submissions/route';
import { NextRequest } from 'next/server';

const topicContent = {
  chinesePrompt: '昨天我在咖啡店遇到了朋友',
  keyPoints: ['Meeting at coffee shop', 'Yesterday'],
  suggestedVocab: [
    { word: 'run into', phonetic: '/rʌn/', partOfSpeech: 'phrasal verb', chinese: '偶遇', exampleContext: 'I ran into a friend.' },
  ],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/submissions', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    resetLLMMock();
  });

  it('evaluates and persists for authenticated user with topicId', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);
    prismaMock.topic.findUnique.mockResolvedValue({ id: 'topic-1', accountId: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.submission.create.mockResolvedValue({ id: 'sub-1' });
    prismaMock.grammarError.createMany.mockResolvedValue({ count: 1 });
    prismaMock.vocabularyUsage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.speaker.update.mockResolvedValue({});

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
      topicType: 'translation',
      topicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.evaluation.type).toBe('translation');
    expect(data.data.overallScore).toBeGreaterThan(0);
    expect(data.data.id).toBe('sub-1');
  });

  it('evaluates without persisting for unauthenticated user', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent,
      userResponse: 'I met my friend at the coffee shop.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBeUndefined();
    expect(prismaMock.submission.create).not.toHaveBeenCalled();
  });

  it('returns 404 when topic not found', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000099',
      topicType: 'translation',
      topicContent: {
        ...topicContent,
        suggestedVocab: topicContent.suggestedVocab,
      },
      userResponse: 'Hello world test',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('returns 403 when topic belongs to another user', async () => {
    setAuthenticated({ id: 'user-1' });
    prismaMock.topic.findUnique.mockResolvedValue({ id: 'topic-1', accountId: 'other-user' });

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
      topicType: 'translation',
      topicContent: {
        ...topicContent,
        suggestedVocab: topicContent.suggestedVocab,
      },
      userResponse: 'Hello world test',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });

  it('evaluates expression type correctly', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(expressionEval);

    const response = await POST(makeRequest({
      topicType: 'expression',
      topicContent: {
        chinesePrompt: '描述你的旅行经历',
        guidingQuestions: ['你去了哪里?'],
        suggestedVocab: [
          { word: 'explore', phonetic: '/ɪkˈsplɔːr/', partOfSpeech: 'verb', chinese: '探索', exampleContext: 'test' },
        ],
        grammarHints: [{ point: 'Past tense', explanation: '用过去式', pattern: 'S+V-ed', example: 'I visited...' }],
      },
      userResponse: 'I traveled to Japan last year and it was amazing.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.evaluation.type).toBe('expression');
  });
});
