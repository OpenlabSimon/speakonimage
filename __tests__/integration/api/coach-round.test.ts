import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationEval from '../../mocks/fixtures/evaluation-translation.json';
import expressionEval from '../../mocks/fixtures/evaluation-expression.json';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

import { POST } from '@/app/api/coach/round/route';

const translationTopicContent = {
  chinesePrompt: '昨天我在咖啡店遇到了朋友',
  keyPoints: ['Meeting at coffee shop', 'Yesterday'],
  suggestedVocab: [
    { word: 'run into', phonetic: '/rʌn/', partOfSpeech: 'phrasal verb', chinese: '偶遇', exampleContext: 'I ran into a friend.' },
  ],
};

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/coach/round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/coach/round', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    resetLLMMock();
    mockFetch.mockReset();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('returns practiceMode and skillDomain for translation text rounds', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.practiceMode).toBe('translation_text');
    expect(data.data.skillDomain).toBe('translation');
    expect(data.data.teacher).toEqual({ soulId: 'default' });
    expect(data.data.review).toEqual({ mode: 'text', autoPlayAudio: false });
    expect(typeof data.data.reviewText).toBe('string');
    expect(typeof data.data.ttsText).toBe('string');
    expect(data.data.reviewText.length).toBeGreaterThan(20);
    expect(data.data.ttsText.length).toBeGreaterThan(20);
    expect(data.data.audioReview).toEqual({
      enabled: false,
      provider: 'elevenlabs',
      status: 'skipped',
      reason: 'review mode does not require audio',
    });
    expect(data.data.htmlArtifact).toEqual({
      enabled: false,
      status: 'skipped',
      reason: 'review mode does not require html',
    });
    expect(data.data.submissionId).toBeUndefined();
  });

  it('persists and returns session metadata for authenticated rounds', async () => {
    setAuthenticated({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(expressionEval);
    prismaMock.topic.findUnique.mockResolvedValue({ id: 'topic-1', accountId: 'user-1' });
    prismaMock.speaker.findFirst.mockResolvedValue({ id: 'speaker-1' });
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.submission.create.mockResolvedValue({ id: 'sub-1' });
    prismaMock.grammarError.createMany.mockResolvedValue({ count: 0 });
    prismaMock.vocabularyUsage.createMany.mockResolvedValue({ count: 0 });
    prismaMock.speaker.update.mockResolvedValue({});

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
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
      inputMethod: 'voice',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.submissionId).toBe('sub-1');
    expect(data.data.sessionId).toBe('session-1');
    expect(data.data.practiceMode).toBe('expression_voice');
    expect(data.data.skillDomain).toBe('spoken_expression');
    expect(data.data.reviewText).toContain('口语');
    expect(data.data.ttsText).toContain('口语');
    expect(data.data.audioReview.status).toBe('skipped');
    expect(data.data.htmlArtifact.status).toBe('skipped');
  });

  it('accepts explicit teacher soul and review mode preferences', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(24)),
    });

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      teacher: {
        soulId: 'humorous',
        voiceId: 'elevenlabs-voice-1',
      },
      review: {
        mode: 'all',
        autoPlayAudio: true,
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.teacher).toEqual({
      soulId: 'humorous',
      voiceId: 'elevenlabs-voice-1',
    });
    expect(data.data.review).toEqual({
      mode: 'all',
      autoPlayAudio: true,
    });
    expect(data.data.reviewText).toContain('槽点');
    expect(data.data.ttsText).toContain('槽点');
    expect(data.data.audioReview.enabled).toBe(true);
    expect(data.data.audioReview.provider).toBe('elevenlabs');
    expect(data.data.audioReview.status).toBe('generated');
    expect(data.data.audioReview.voiceId).toBe('elevenlabs-voice-1');
    expect(data.data.audioReview.text).toBe(data.data.ttsText);
    expect(data.data.audioReview.audioUrl).toContain('data:audio/mpeg;base64,');
    expect(data.data.audioReview.format).toBe('mp3');
    expect(data.data.htmlArtifact.enabled).toBe(true);
    expect(data.data.htmlArtifact.status).toBe('generated');
    expect(data.data.htmlArtifact.title).toContain('Coach Review');
    expect(data.data.htmlArtifact.html).toContain('<!DOCTYPE html>');
    expect(data.data.htmlArtifact.html).toContain('本轮老师复盘');
  });

  it('generates html artifact for html-only review mode without audio', async () => {
    setUnauthenticated();
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const response = await POST(makeRequest({
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
      review: {
        mode: 'html',
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.audioReview.status).toBe('skipped');
    expect(data.data.htmlArtifact.status).toBe('generated');
    expect(data.data.htmlArtifact.html).toContain('English Coach Lesson Artifact');
  });

  it('requires auth when persisting to a saved topic', async () => {
    setUnauthenticated();

    const response = await POST(makeRequest({
      topicId: 'a0000000-0000-4000-a000-000000000001',
      topicType: 'translation',
      topicContent: translationTopicContent,
      userResponse: 'I met my friend at the coffee shop yesterday.',
      inputMethod: 'text',
    }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });
});
