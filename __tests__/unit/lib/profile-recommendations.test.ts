import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLLMProvider, resetLLMMock } from '../../mocks/llm';

vi.mock('@/lib/llm', () => ({
  getLLMProvider: () => mockLLMProvider,
}));

import { buildEnhancedRecommendations } from '@/lib/profile/recommendations';

describe('buildEnhancedRecommendations', () => {
  beforeEach(() => {
    resetLLMMock();
  });

  it('rewrites base recommendations with llm output', async () => {
    mockLLMProvider.generateJSON.mockResolvedValue({
      topics: [
        {
          title: '聊聊你最近在试的 AI 工具',
          detail: '用一段完整经历讲讲你最近试过的 AI 工具，以及它哪里帮到了你。',
          reason: '这样最容易围绕你的真实兴趣持续开口。',
        },
      ],
      vocabulary: [
        {
          title: 'iterate',
          detail: '下一轮请主动用 iterate 描述你如何反复改进一个想法或产品。',
          reason: '这个词和你最近常聊的产品迭代场景高度相关。',
        },
      ],
      examples: [
        {
          title: 'iterate',
          detail: 'We iterated on the product after getting feedback from our first users.',
          reason: '这句能直接迁移到你常聊的产品和工具话题里。',
        },
      ],
    });

    const result = await buildEnhancedRecommendations({
      base: {
        topics: [
          {
            id: 'topic-1',
            kind: 'topic',
            title: '围绕 AI tools 继续开口',
            detail: '试着描述你最近为什么关注 AI tools。',
            reason: '你最近多次提到这个话题。',
            relatedInterestKeys: ['ai-tools'],
          },
        ],
        vocabulary: [],
        examples: [],
        nextFocus: ['注意 a/an 的使用'],
        generatedAt: new Date().toISOString(),
      },
      interests: [
        {
          key: 'ai-tools',
          label: 'AI tools',
          source: 'session_topic',
          strength: 2,
          evidenceCount: 2,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      goals: [],
      recentVocabulary: [],
      weakWords: [],
    });

    expect(result.topics[0].title).toContain('AI');
    expect(result.vocabulary[0].title).toBe('iterate');
    expect(result.examples[0].detail).toContain('iterated');
    expect(result.nextFocus).toContain('注意 a/an 的使用');
  });

  it('falls back to base recommendations when llm fails', async () => {
    mockLLMProvider.generateJSON.mockRejectedValue(new Error('boom'));

    const base = {
      topics: [
        {
          id: 'topic-1',
          kind: 'topic' as const,
          title: 'Base topic',
          detail: 'Base detail',
          reason: 'Base reason',
          relatedInterestKeys: [],
        },
      ],
      vocabulary: [],
      examples: [],
      nextFocus: [],
      generatedAt: new Date().toISOString(),
    };

    const result = await buildEnhancedRecommendations({
      base,
      interests: [],
      goals: [],
      recentVocabulary: [],
      weakWords: [],
    });

    expect(result).toEqual(base);
  });
});
