import { describe, expect, it } from 'vitest';
import {
  applyRecommendationFeedback,
  mergeSessionSignalsIntoProfile,
  getPersistedProfileSignals,
  buildRecommendations,
  buildTopicPersonalizationContext,
  applyInterestFeedback,
  buildCoachMemory,
} from '@/lib/profile/memory';
import type { SessionExtractionResult, ChatMessage } from '@/lib/memory/types';

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id || 'msg-1',
    sessionId: overrides.sessionId || 'session-1',
    role: overrides.role || 'user',
    content: overrides.content || 'test',
    contentType: overrides.contentType || 'text',
    metadata: overrides.metadata,
    createdAt: overrides.createdAt || new Date('2026-03-18T10:00:00.000Z'),
  };
}

const extraction: SessionExtractionResult = {
  sessionSummary: '用户围绕 AI 工具讲述最近经历。',
  newVocabulary: [
    {
      word: 'iterate',
      context: 'We iterate quickly on new AI tools every week.',
      mastery: 'developing',
      cefrLevel: 'B2',
    },
  ],
  errors: [],
  grammarPointsTouched: ['articles'],
  topicsDiscussed: ['AI tools', 'OpenClaw'],
  suggestedFocusNext: ['注意 a/an 的使用', '把最近经历讲得更具体'],
  overallProgress: 'improving',
  extractedAt: new Date('2026-03-18T10:00:00.000Z'),
};

describe('profile memory helpers', () => {
  it('merges interests, vocabulary, and memory snippets from a session', () => {
    const nextProfile = mergeSessionSignalsIntoProfile({
      existingProfile: {
        interests: [
          {
            key: 'travel',
            label: 'travel',
            source: 'manual',
            strength: 1,
            evidenceCount: 1,
            lastSeenAt: '2026-03-17T10:00:00.000Z',
          },
        ],
      },
      extraction,
      topicInput: 'AI 工具练习',
      messages: [
        makeMessage({
          id: 'user-1',
          role: 'user',
          content: 'I recently tried OpenClaw and another AI tool for my project.',
        }),
        makeMessage({
          id: 'coach-1',
          role: 'assistant',
          contentType: 'evaluation',
          content: '很好，下一次请更自然地使用 an AI tool 这样的表达。',
          metadata: { kind: 'coach_review' },
        }),
      ],
    });

    const persisted = getPersistedProfileSignals(nextProfile);

    expect(persisted.interests.map((item) => item.label)).toEqual(
      expect.arrayContaining(['travel', 'AI tools', 'OpenClaw', 'AI 工具练习'])
    );
    expect(persisted.recentVocabulary[0].word).toBe('iterate');
    expect(persisted.memorySnippets.some((item) => item.kind === 'user_output')).toBe(true);
    expect(persisted.memorySnippets.some((item) => item.kind === 'coach_feedback')).toBe(true);
    expect(persisted.entities.map((item) => item.label)).toEqual(
      expect.arrayContaining(['OpenClaw', 'AI'])
    );
  });

  it('builds practical recommendations from profile signals', () => {
    const recommendations = buildRecommendations({
      interests: [
        {
          key: 'ai-tools',
          label: 'AI tools',
          source: 'session_topic',
          strength: 2,
          evidenceCount: 2,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      goals: [
        {
          key: 'articles',
          label: '注意 a/an 的使用',
          strength: 1.5,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      recentVocabulary: [
        {
          word: 'iterate',
          context: 'We iterate quickly on new AI tools every week.',
          mastery: 'developing',
          lastSeenAt: '2026-03-18T10:00:00.000Z',
          cefrLevel: 'B2',
        },
      ],
      weakWords: [{ word: 'article', incorrect: 3, correct: 1 }],
      topErrors: [{ pattern: 'articles', correctedText: 'I recently tried an AI tool.' }],
    });

    expect(recommendations.topics).toHaveLength(1);
    expect(recommendations.vocabulary.length).toBeGreaterThan(0);
    expect(recommendations.examples.map((item) => item.detail)).toEqual(
      expect.arrayContaining([
        'We iterate quickly on new AI tools every week.',
        'I recently tried an AI tool.',
      ])
    );
    expect(recommendations.nextFocus).toContain('注意 a/an 的使用');
  });

  it('builds topic personalization context from stored memory', () => {
    const profile = {
      interests: [
        {
          key: 'ai-tools',
          label: 'AI tools',
          source: 'session_topic',
          strength: 2,
          evidenceCount: 2,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      goals: [
        {
          key: 'articles',
          label: '注意 a/an 的使用',
          strength: 1.5,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      recentVocabulary: [
        {
          word: 'iterate',
          context: 'We iterate quickly on new AI tools every week.',
          mastery: 'developing',
          lastSeenAt: '2026-03-18T10:00:00.000Z',
          cefrLevel: 'B2',
        },
      ],
    };

    const context = buildTopicPersonalizationContext(profile);

    expect(context).toContain('AI tools');
    expect(context).toContain('注意 a/an 的使用');
    expect(context).toContain('iterate');
  });

  it('applies manual interest feedback and hides removed inferred interests', () => {
    const profile = {
      interests: [
        {
          key: 'ai-tools',
          label: 'AI tools',
          source: 'session_topic',
          strength: 2,
          evidenceCount: 2,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
        {
          key: 'travel',
          label: 'travel',
          source: 'session_topic',
          strength: 1,
          evidenceCount: 1,
          lastSeenAt: '2026-03-17T10:00:00.000Z',
        },
      ],
    };

    const nextProfile = applyInterestFeedback(profile, ['AI tools', 'startups']);
    const persisted = getPersistedProfileSignals(nextProfile);

    expect(persisted.interests.map((item) => item.label)).toEqual(
      expect.arrayContaining(['AI tools', 'startups'])
    );
    expect(persisted.interests.map((item) => item.label)).not.toContain('travel');
    expect(persisted.hiddenInterestKeys).toContain('travel');
  });

  it('stores recommendation feedback and tunes related interests', () => {
    const nextProfile = applyRecommendationFeedback(
      {
        interests: [
          {
            key: 'ai-tools',
            label: 'AI tools',
            source: 'session_topic',
            strength: 2,
            evidenceCount: 2,
            lastSeenAt: '2026-03-18T10:00:00.000Z',
          },
        ],
      },
      {
        recommendationId: 'topic-enhanced-ai-tools',
        recommendationKind: 'topic',
        recommendationTitle: '聊聊你最近在试的 AI 工具',
        sentiment: 'helpful',
        relatedInterestKeys: ['ai-tools'],
      }
    );

    const persisted = getPersistedProfileSignals(nextProfile);

    expect(persisted.recommendationFeedback[0].recommendationId).toBe('topic-enhanced-ai-tools');
    expect(persisted.recommendationFeedback[0].sentiment).toBe('helpful');
    expect(persisted.interests[0].strength).toBeGreaterThan(2);
  });

  it('builds coach memory with long-term and current-round reminders', () => {
    const coachMemory = buildCoachMemory({
      goals: [
        {
          key: 'articles',
          label: '注意 a/an 的使用',
          strength: 1.5,
          lastSeenAt: '2026-03-18T10:00:00.000Z',
        },
      ],
      topErrors: [{ pattern: 'past tense', correctedText: 'I met an old friend yesterday.' }],
      currentRoundReminders: [
        {
          id: 'round-1',
          scope: 'current_round',
          text: '这轮先优先修正 a/an。',
          source: 'coach_review',
          createdAt: '2026-03-18T10:00:00.000Z',
          relatedPatterns: ['articles'],
        },
      ],
    });

    expect(coachMemory.longTermReminders).toHaveLength(2);
    expect(coachMemory.currentRoundReminders[0].text).toContain('a/an');
  });
});
