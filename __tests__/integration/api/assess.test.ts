import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import assessmentFixture from '../../mocks/fixtures/assessment.json';

vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));

import { POST } from '@/app/api/assess/route';
import { NextRequest } from 'next/server';

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/assess', () => {
  beforeEach(() => {
    resetLLMMock();
  });

  it('returns assessment for valid introduction', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue(assessmentFixture);

    const response = await POST(makeRequest({
      introductionText: 'Hello, my name is 小明. I like to study English because it is very interesting.',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.estimatedLevel).toBe('B1');
    expect(data.data.confidence).toBe(0.7);
    expect(data.data.analysis).toBeDefined();
    expect(data.data.reviewText).toContain('先说结论');
    expect(data.data.speechScript).toContain('下一步你就顺着这段自我介绍继续优化');
    expect(data.data.teacher).toEqual({ soulId: 'default' });
    expect(data.data.review).toEqual({ mode: 'all', autoPlayAudio: true });
    expect(data.data.audioReview.status).toBe('pending');
    expect(data.data.audioReview.requestToken).toBeTruthy();
  });

  it('returns 400 for too short introduction', async () => {
    const response = await POST(makeRequest({
      introductionText: 'Hi',
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 500 on LLM failure', async () => {
    mockLLMProvider.generateJSON.mockRejectedValue(new Error('LLM error'));

    const response = await POST(makeRequest({
      introductionText: 'Hello, my name is 小明. I like English very much and I want to improve.',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
