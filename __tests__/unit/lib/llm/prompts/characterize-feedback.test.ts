import {
  CharacterFeedbackSchema,
  buildCharacterizeSystemPrompt,
  buildCharacterizeUserPrompt,
} from '@/lib/llm/prompts/characterize-feedback';
import { getCharacter } from '@/lib/characters';
import fixture from '../../../../mocks/fixtures/character-feedback.json';

// ---------------------------------------------------------------------------
// CharacterFeedbackSchema — fixture validation
// ---------------------------------------------------------------------------

describe('CharacterFeedbackSchema', () => {
  it('validates a well-formed character feedback fixture', () => {
    const result = CharacterFeedbackSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing feedbackText', () => {
    const { feedbackText: _, ...incomplete } = fixture;
    const result = CharacterFeedbackSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing ttsText', () => {
    const { ttsText: _, ...incomplete } = fixture;
    const result = CharacterFeedbackSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing mood', () => {
    const { mood: _, ...incomplete } = fixture;
    const result = CharacterFeedbackSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mood enum validation
// ---------------------------------------------------------------------------

describe('CharacterFeedbackSchema mood validation', () => {
  it.each([
    'impressed',
    'encouraging',
    'tough-love',
    'neutral',
  ] as const)('accepts mood "%s"', (mood) => {
    const result = CharacterFeedbackSchema.safeParse({ ...fixture, mood });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid mood value', () => {
    const result = CharacterFeedbackSchema.safeParse({ ...fixture, mood: 'angry' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string for mood', () => {
    const result = CharacterFeedbackSchema.safeParse({ ...fixture, mood: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCharacterizeSystemPrompt
// ---------------------------------------------------------------------------

describe('buildCharacterizeSystemPrompt', () => {
  it('includes the character persona for "thornberry"', () => {
    const prompt = buildCharacterizeSystemPrompt('thornberry');
    const character = getCharacter('thornberry');
    expect(prompt).toContain(character.persona);
  });

  it('includes the character persona for "mei"', () => {
    const prompt = buildCharacterizeSystemPrompt('mei');
    const character = getCharacter('mei');
    expect(prompt).toContain(character.persona);
  });

  it('includes the character persona for "ryan"', () => {
    const prompt = buildCharacterizeSystemPrompt('ryan');
    const character = getCharacter('ryan');
    expect(prompt).toContain(character.persona);
  });

  it('returns a non-empty string', () => {
    const prompt = buildCharacterizeSystemPrompt('mei');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('contains JSON output instructions', () => {
    const prompt = buildCharacterizeSystemPrompt('thornberry');
    expect(prompt).toContain('feedbackText');
    expect(prompt).toContain('ttsText');
    expect(prompt).toContain('mood');
  });
});

// ---------------------------------------------------------------------------
// buildCharacterizeUserPrompt
// ---------------------------------------------------------------------------

describe('buildCharacterizeUserPrompt', () => {
  const baseParams = {
    overallScore: 75,
    evaluation: { semanticAccuracy: { score: 80 }, grammar: { score: 70 } },
    userResponse: 'I met an old friend at the coffee shop.',
    topicType: 'translation',
    chinesePrompt: '昨天我在咖啡店遇到了一个老朋友',
  };

  it('includes the overall score', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain('75');
  });

  it('includes the user response', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain(baseParams.userResponse);
  });

  it('includes the Chinese prompt', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain(baseParams.chinesePrompt);
  });

  it('includes the evaluation data as JSON', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain('semanticAccuracy');
    expect(prompt).toContain('80');
  });

  it('labels translation topic type correctly', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain('中译英翻译');
  });

  it('labels expression topic type correctly', () => {
    const prompt = buildCharacterizeUserPrompt({
      ...baseParams,
      topicType: 'expression',
    });
    expect(prompt).toContain('话题表达');
  });

  it('labels text input method by default', () => {
    const prompt = buildCharacterizeUserPrompt(baseParams);
    expect(prompt).toContain('文字输入');
  });

  it('labels voice input method when specified', () => {
    const prompt = buildCharacterizeUserPrompt({
      ...baseParams,
      inputMethod: 'voice',
    });
    expect(prompt).toContain('语音输入');
  });
});
