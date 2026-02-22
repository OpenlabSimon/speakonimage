import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  needsCompression,
  splitForCompression,
  formatSummaryForPrompt,
} from '@/lib/memory/ContextCompressor';
import type { CompressionResult } from '@/lib/memory/ContextCompressor';
import type { ChatMessage } from '@/lib/memory/types';

function makeMessage(content: string, role: 'user' | 'assistant' | 'system' = 'user'): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role,
    content,
    contentType: 'text',
    createdAt: new Date(),
  };
}

describe('estimateTokens', () => {
  it('estimates tokens as ceil(length / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcdefghi')).toBe(3);
  });

  it('handles longer text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });
});

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('sums token estimates plus overhead per message', () => {
    const messages = [
      makeMessage('abcd'),       // ceil(4/4) + 10 = 11
      makeMessage('abcdefgh'),   // ceil(8/4) + 10 = 12
    ];
    expect(estimateMessagesTokens(messages)).toBe(23);
  });
});

describe('needsCompression', () => {
  it('returns false when messages count is below threshold', () => {
    const messages = Array.from({ length: 20 }, (_, i) => makeMessage(`msg ${i}`));
    expect(needsCompression(messages)).toBe(false);
  });

  it('returns true when messages count exceeds default threshold of 20', () => {
    const messages = Array.from({ length: 21 }, (_, i) => makeMessage(`msg ${i}`));
    expect(needsCompression(messages)).toBe(true);
  });

  it('uses custom threshold', () => {
    const messages = Array.from({ length: 6 }, (_, i) => makeMessage(`msg ${i}`));
    expect(needsCompression(messages, 5)).toBe(true);
    expect(needsCompression(messages, 10)).toBe(false);
  });
});

describe('splitForCompression', () => {
  it('returns all messages as toKeep when count <= keepRecent', () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage(`msg ${i}`));
    const result = splitForCompression(messages, 10);
    expect(result.toCompress).toHaveLength(0);
    expect(result.toKeep).toHaveLength(5);
  });

  it('returns all messages as toKeep when count equals keepRecent', () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeMessage(`msg ${i}`));
    const result = splitForCompression(messages, 10);
    expect(result.toCompress).toHaveLength(0);
    expect(result.toKeep).toHaveLength(10);
  });

  it('splits messages with default keepRecent=10', () => {
    const messages = Array.from({ length: 25 }, (_, i) => makeMessage(`msg ${i}`));
    const result = splitForCompression(messages);
    expect(result.toCompress).toHaveLength(15);
    expect(result.toKeep).toHaveLength(10);
    // toKeep should be the last 10
    expect(result.toKeep[0].content).toBe('msg 15');
    expect(result.toKeep[9].content).toBe('msg 24');
  });

  it('splits correctly with custom keepRecent', () => {
    const messages = Array.from({ length: 15 }, (_, i) => makeMessage(`msg ${i}`));
    const result = splitForCompression(messages, 5);
    expect(result.toCompress).toHaveLength(10);
    expect(result.toKeep).toHaveLength(5);
    expect(result.toKeep[0].content).toBe('msg 10');
  });
});

describe('formatSummaryForPrompt', () => {
  it('formats a full compression result', () => {
    const compression: CompressionResult = {
      summary: 'Discussed daily routine vocabulary.',
      keyPoints: ['Past tense usage', 'Time expressions'],
      mainTopics: ['daily routine'],
      notableErrors: ['Missing articles', 'Wrong preposition'],
      vocabulary: ['breakfast', 'commute', 'schedule'],
    };

    const result = formatSummaryForPrompt(compression);

    expect(result).toContain('## 对话背景');
    expect(result).toContain('Discussed daily routine vocabulary.');
    expect(result).toContain('## 已学要点');
    expect(result).toContain('- Past tense usage');
    expect(result).toContain('- Time expressions');
    expect(result).toContain('## 需关注的错误');
    expect(result).toContain('- Missing articles');
    expect(result).toContain('## 涉及词汇');
    expect(result).toContain('breakfast, commute, schedule');
  });

  it('omits empty sections', () => {
    const compression: CompressionResult = {
      summary: 'Brief chat.',
      keyPoints: [],
      mainTopics: [],
      notableErrors: [],
      vocabulary: [],
    };

    const result = formatSummaryForPrompt(compression);

    expect(result).toContain('## 对话背景');
    expect(result).not.toContain('## 已学要点');
    expect(result).not.toContain('## 需关注的错误');
    expect(result).not.toContain('## 涉及词汇');
  });

  it('returns empty string for fully empty compression', () => {
    const compression: CompressionResult = {
      summary: '',
      keyPoints: [],
      mainTopics: [],
      notableErrors: [],
      vocabulary: [],
    };

    const result = formatSummaryForPrompt(compression);
    expect(result).toBe('');
  });
});
