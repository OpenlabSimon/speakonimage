import { describe, expect, it } from 'vitest';
import { __test__ } from '@/lib/profile/ProfileInjector';

describe('ProfileInjector', () => {
  it('builds compact structured profile context', () => {
    const context = __test__.buildStructuredProfileContext({
      estimatedCefr: 'B1',
      interests: ['AI tools', 'startups', 'travel'],
      goals: ['practice past tense', 'speak more naturally'],
      errorPatterns: [
        { pattern: 'articles', count: 4 },
        { pattern: 'past tense', count: 3 },
      ],
      weakVocabulary: ['prototype', 'iterate', 'analyze'],
      recentUserMemory: 'I usually test new AI tools with my friends on weekends.',
      recentCoachMemory: 'Keep using past tense more consistently in casual storytelling.',
      currentRoundReminders: ['Watch a/an before old', 'Keep the verb in past tense'],
    });

    expect(context).toBe(
      'PROFILE{level=B1; interests=AI tools|startups|travel; goals=practice past tense|speak more naturally; errors=articles(4)|past tense(3); weak_vocab=prototype|iterate|analyze; recent_user=I usually test new AI tools with my friends on weekends.; recent_coach=Keep using past tense more consistently in casual storytelling.; round_focus=Watch a/an before old|Keep the verb in past tense}'
    );
  });
});
