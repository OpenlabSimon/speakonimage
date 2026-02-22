import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import feedbackFixture from '../../mocks/fixtures/character-feedback.json';

vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));

import { POST } from '@/app/api/characterize/route';
import { NextRequest } from 'next/server';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/characterize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  characterId: 'mei',
  overallScore: 75,
  evaluation: { type: 'translation', semanticAccuracy: { score: 85 } },
  userResponse: 'I met my friend at the coffee shop yesterday.',
  topicType: 'translation',
  chinesePrompt: '昨天我在咖啡店遇到了朋友',
};

describe('POST /api/characterize', () => {
  beforeEach(() => {
    resetLLMMock();
  });

  it('returns character feedback for mei', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(feedbackFixture);

    const response = await POST(makeRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.feedbackText).toBeDefined();
    expect(data.data.mood).toBe('encouraging');
  });

  it('returns character feedback for thornberry', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(feedbackFixture);

    const response = await POST(makeRequest({ ...validBody, characterId: 'thornberry' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns character feedback for ryan', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(feedbackFixture);

    const response = await POST(makeRequest({ ...validBody, characterId: 'ryan' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 400 for invalid characterId', async () => {
    const response = await POST(makeRequest({ ...validBody, characterId: 'invalid' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('characterId');
  });

  it('returns 400 for missing required fields', async () => {
    const response = await POST(makeRequest({ characterId: 'mei' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required fields');
  });
});
