import { describe, expect, it } from 'vitest';
import { buildGeminiSpeechPrompt } from '@/domains/teachers/review-audio-generator';

describe('buildGeminiSpeechPrompt', () => {
  it('includes energetic coaching guidance and transcript preservation rules', () => {
    const prompt = buildGeminiSpeechPrompt(
      'energetic',
      '很好，这轮输出是有力量的。Keep going!'
    );

    expect(prompt).toContain('high-energy bilingual coach');
    expect(prompt).toContain('not like an announcer');
    expect(prompt).toContain('Do not summarize, do not omit any words');
    expect(prompt).toContain('Keep both the Chinese and English audible and clear.');
    expect(prompt).toContain('很好，这轮输出是有力量的。Keep going!');
  });

  it('differentiates gentle and strict delivery', () => {
    const gentle = buildGeminiSpeechPrompt('gentle', 'test');
    const strict = buildGeminiSpeechPrompt('strict', 'test');

    expect(gentle).toContain('supportive teacher who genuinely believes in the student');
    expect(strict).toContain('Firm, direct, and controlled');
    expect(gentle).not.toBe(strict);
  });
});
