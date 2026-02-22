import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockGetCurrentUser, resetAuthMock } from '../../mocks/auth';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationFixture from '../../mocks/fixtures/topic-translation.json';
import expressionFixture from '../../mocks/fixtures/topic-expression.json';

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  auth: vi.fn(),
  checkAuth: vi.fn(),
  unauthorizedResponse: vi.fn(),
}));
vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));

import { POST } from '@/app/api/topics/generate/route';
import { NextRequest } from 'next/server';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/topics/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/topics/generate', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    resetLLMMock();
  });

  it('generates translation topic with explicit type', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(translationFixture);
    prismaMock.topic.create.mockResolvedValue({ id: 'topic-1', ...translationFixture });

    const response = await POST(makeRequest({
      text: '咖啡店遇到老朋友',
      type: 'translation',
      targetCefr: 'B1',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.type).toBe('translation');
    expect(data.data.chinesePrompt).toBeDefined();
    expect(data.data.id).toBe('topic-1');
    expect(mockLLMProvider.generateJSON).toHaveBeenCalledOnce();
    expect(prismaMock.topic.create).toHaveBeenCalledOnce();
  });

  it('generates expression topic with explicit type', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(expressionFixture);
    prismaMock.topic.create.mockResolvedValue({ id: 'topic-2', ...expressionFixture });

    const response = await POST(makeRequest({
      text: '旅行经历',
      type: 'expression',
      targetCefr: 'B1',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.type).toBe('expression');
    expect(data.data.guidingQuestions).toBeDefined();
  });

  it('uses unified prompt when no type specified', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    mockLLMProvider.generateJSON.mockResolvedValue(translationFixture);
    prismaMock.topic.create.mockResolvedValue({ id: 'topic-3', ...translationFixture });

    const response = await POST(makeRequest({
      text: '昨天我在公园散步',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('does not save to database when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(undefined);
    mockLLMProvider.generateJSON.mockResolvedValue(translationFixture);

    const response = await POST(makeRequest({
      text: '测试',
      type: 'translation',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBeUndefined();
    expect(prismaMock.topic.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const response = await POST(makeRequest({
      text: '', // min 1 char
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 500 on LLM failure', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockLLMProvider.generateJSON.mockRejectedValue(new Error('LLM timeout'));

    const response = await POST(makeRequest({
      text: '测试',
      type: 'translation',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('LLM timeout');
  });
});
