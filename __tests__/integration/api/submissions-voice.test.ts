import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';
import { mockCheckAuth, setAuthenticated, setUnauthenticated, resetAuthMock } from '../../mocks/auth';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';
import translationEval from '../../mocks/fixtures/evaluation-translation.json';

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
vi.mock('@/lib/speech/azure-stt', () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://blob.test/audio.webm' }),
}));
vi.mock('@/lib/memory/ConversationManager', () => ({
  getOrCreateSessionForTopic: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
}));
vi.mock('@/lib/profile/ProfileInjector', () => ({
  buildProfileContext: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/submissions/voice/route';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import { NextRequest } from 'next/server';

function makeFormData(overrides: Record<string, string | Blob> = {}): FormData {
  const formData = new FormData();
  formData.set('audio', new Blob(['audio-data'], { type: 'audio/webm' }), 'recording.webm');
  formData.set('topicData', JSON.stringify({
    type: 'translation',
    chinesePrompt: '测试',
    keyPoints: ['test'],
    suggestedVocab: [{ word: 'test' }],
  }));
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe('POST /api/submissions/voice', () => {
  beforeEach(() => {
    resetPrismaMock();
    resetAuthMock();
    resetLLMMock();
    vi.mocked(transcribeAudio).mockReset();
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'westus3';
  });

  it('transcribes and evaluates audio successfully', async () => {
    setUnauthenticated();
    vi.mocked(transcribeAudio).mockResolvedValue({
      text: 'Hello world',
      confidence: 0.95,
      duration: 2.5,
      status: 'success',
    });
    mockLLMProvider.generateJSON.mockResolvedValue(translationEval);

    const request = new NextRequest('http://localhost/api/submissions/voice', {
      method: 'POST',
      body: makeFormData(),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.transcription).toBe('Hello world');
    expect(data.data.evaluation).toBeDefined();
    expect(data.data.inputMethod).toBe('voice');
  });

  it('returns 400 when no audio provided', async () => {
    const formData = new FormData();
    formData.set('topicData', '{}');

    const request = new NextRequest('http://localhost/api/submissions/voice', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('No audio');
  });

  it('returns no_match status for STT no_match', async () => {
    setUnauthenticated();
    vi.mocked(transcribeAudio).mockResolvedValue({
      text: '',
      status: 'no_match',
      error: 'No speech detected',
    });

    const request = new NextRequest('http://localhost/api/submissions/voice', {
      method: 'POST',
      body: makeFormData(),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe('no_match');
  });

  it('returns 500 on STT failure', async () => {
    setUnauthenticated();
    vi.mocked(transcribeAudio).mockResolvedValue({
      text: '',
      status: 'error',
      error: 'Azure STT failed',
    });

    const request = new NextRequest('http://localhost/api/submissions/voice', {
      method: 'POST',
      body: makeFormData(),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  it('returns transcription only when skipEvaluation=true', async () => {
    setUnauthenticated();
    vi.mocked(transcribeAudio).mockResolvedValue({
      text: 'Hello world',
      confidence: 0.9,
      duration: 1.5,
      status: 'success',
    });

    const request = new NextRequest('http://localhost/api/submissions/voice', {
      method: 'POST',
      body: makeFormData({ skipEvaluation: 'true' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.transcription).toBe('Hello world');
    expect(data.data.status).toBe('success');
    expect(data.data.evaluation).toBeUndefined();
    expect(mockLLMProvider.generateJSON).not.toHaveBeenCalled();
  });
});
