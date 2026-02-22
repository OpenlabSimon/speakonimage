import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationEval from '../../mocks/fixtures/evaluation-translation.json';
import expressionEval from '../../mocks/fixtures/evaluation-expression.json';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
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

import { evaluateResponse, persistSubmission, calculateOverallScore } from '@/lib/evaluation/evaluateSubmission';

describe('evaluateResponse', () => {
  beforeEach(() => {
    resetLLMMock();
  });

  it('evaluates translation type', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const result = await evaluateResponse({
      topicType: 'translation',
      chinesePrompt: '测试',
      keyPoints: ['test'],
      suggestedVocab: [{ word: 'test' }],
      userResponse: 'This is a test.',
      inputMethod: 'text',
    });

    expect(result.evaluation.type).toBe('translation');
    expect(result.overallScore).toBeGreaterThan(0);
    expect(mockLLMProvider.generateJSON).toHaveBeenCalledOnce();
  });

  it('evaluates expression type', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(expressionEval);

    const result = await evaluateResponse({
      topicType: 'expression',
      chinesePrompt: '测试话题',
      guidingQuestions: ['Why?'],
      suggestedVocab: [{ word: 'explore' }],
      grammarHints: [{ point: 'Past tense' }],
      userResponse: 'I explored the city.',
      inputMethod: 'text',
    });

    expect(result.evaluation.type).toBe('expression');
    expect(result.overallScore).toBeGreaterThan(0);
  });
});

describe('persistSubmission', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it('creates submission with grammar errors and vocab', async () => {
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.submission.create.mockResolvedValue({ id: 'sub-1' });
    prismaMock.grammarError.createMany.mockResolvedValue({ count: 1 });
    prismaMock.vocabularyUsage.createMany.mockResolvedValue({ count: 1 });
    prismaMock.speaker.update.mockResolvedValue({});

    const result = await persistSubmission({
      topicId: 'topic-1',
      accountId: 'user-1',
      inputMethod: 'text',
      userResponse: 'I have meet my friend at the coffee shop.',
      evaluation: translationEval as any,
      overallScore: 85,
      topicType: 'translation',
      suggestedVocab: [{ word: 'meet' }],
    });

    expect(result.submissionId).toBe('sub-1');
    expect(prismaMock.submission.create).toHaveBeenCalledOnce();
    expect(prismaMock.grammarError.createMany).toHaveBeenCalledOnce();
    expect(prismaMock.speaker.update).toHaveBeenCalledOnce();
  });

  it('records session messages', async () => {
    const { addMessage } = await import('@/lib/memory/ConversationManager');
    vi.mocked(addMessage).mockClear();

    prismaMock.submission.count.mockResolvedValue(1);
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.submission.create.mockResolvedValue({ id: 'sub-2' });
    prismaMock.grammarError.createMany.mockResolvedValue({ count: 0 });
    prismaMock.vocabularyUsage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.speaker.update.mockResolvedValue({});

    await persistSubmission({
      topicId: 'topic-1',
      accountId: 'user-1',
      inputMethod: 'text',
      userResponse: 'Test response',
      evaluation: translationEval as any,
      overallScore: 85,
      topicType: 'translation',
      suggestedVocab: [],
    });

    // addMessage should be called twice: user message + evaluation message
    expect(vi.mocked(addMessage)).toHaveBeenCalledTimes(2);
  });
});

describe('calculateOverallScore', () => {
  it('calculates translation score with correct weights', () => {
    const score = calculateOverallScore(translationEval as any);
    const expected = Math.round(85 * 0.4 + 78 * 0.2 + 90 * 0.2 + 82 * 0.2);
    expect(score).toBe(expected);
  });

  it('calculates expression score with equal weights', () => {
    const score = calculateOverallScore(expressionEval as any);
    const expected = Math.round(88 * 0.25 + 75 * 0.25 + 70 * 0.25 + 80 * 0.25);
    expect(score).toBe(expected);
  });
});
