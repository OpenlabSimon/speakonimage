import {
  SessionExtractionSchema,
  buildSessionExtractionPrompt,
} from '@/lib/llm/prompts/extract-session';
import fixture from '../../../../mocks/fixtures/session-extraction.json';

// ---------------------------------------------------------------------------
// SessionExtractionSchema — fixture validation
// ---------------------------------------------------------------------------

describe('SessionExtractionSchema', () => {
  it('validates a well-formed session extraction fixture', () => {
    const result = SessionExtractionSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with an error that has a non-string severity', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      errors: [{ ...fixture.errors[0], severity: 123 }],
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults when optional fields are omitted', () => {
    const minimal = {};
    const result = SessionExtractionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionSummary).toBe('');
      expect(result.data.newVocabulary).toEqual([]);
      expect(result.data.errors).toEqual([]);
      expect(result.data.grammarPointsTouched).toEqual([]);
      expect(result.data.topicsDiscussed).toEqual([]);
      expect(result.data.suggestedFocusNext).toEqual([]);
      expect(result.data.overallProgress).toBe('stable');
    }
  });
});

// ---------------------------------------------------------------------------
// stringOrArray coercion
// ---------------------------------------------------------------------------

describe('SessionExtractionSchema stringOrArray coercion', () => {
  it('accepts an array of strings for grammarPointsTouched', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      grammarPointsTouched: ['past_tense', 'articles'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grammarPointsTouched).toEqual(['past_tense', 'articles']);
    }
  });

  it('coerces a single string to an array for grammarPointsTouched', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      grammarPointsTouched: 'past_tense',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grammarPointsTouched).toEqual(['past_tense']);
    }
  });

  it('coerces a single string to an array for topicsDiscussed', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      topicsDiscussed: 'friendship',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topicsDiscussed).toEqual(['friendship']);
    }
  });

  it('coerces a single string to an array for suggestedFocusNext', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      suggestedFocusNext: 'Practice irregular verbs',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestedFocusNext).toEqual(['Practice irregular verbs']);
    }
  });

  it('coerces an empty string to an empty array', () => {
    const result = SessionExtractionSchema.safeParse({
      ...fixture,
      grammarPointsTouched: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grammarPointsTouched).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Nested schema defaults
// ---------------------------------------------------------------------------

describe('SessionExtractionSchema nested defaults', () => {
  it('applies defaults for error sub-fields', () => {
    const result = SessionExtractionSchema.safeParse({
      errors: [{}],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const error = result.data.errors[0];
      expect(error.type).toBe('unknown');
      expect(error.userSaid).toBe('');
      expect(error.correction).toBe('');
      expect(error.pattern).toBe('');
      expect(error.severity).toBe('medium');
      expect(error.isRecurring).toBe(false);
    }
  });

  it('applies defaults for vocabulary sub-fields', () => {
    const result = SessionExtractionSchema.safeParse({
      newVocabulary: [{ word: 'hello' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const vocab = result.data.newVocabulary[0];
      expect(vocab.word).toBe('hello');
      expect(vocab.context).toBe('');
      expect(vocab.mastery).toBe('new');
    }
  });
});

// ---------------------------------------------------------------------------
// buildSessionExtractionPrompt
// ---------------------------------------------------------------------------

describe('buildSessionExtractionPrompt', () => {
  const formattedMessages = 'User: Hello\nAssistant: Hi there!';
  const sessionType = 'practice';

  it('includes the formatted messages', () => {
    const prompt = buildSessionExtractionPrompt(formattedMessages, sessionType);
    expect(prompt).toContain(formattedMessages);
  });

  it('includes the session type label for practice', () => {
    const prompt = buildSessionExtractionPrompt(formattedMessages, 'practice');
    expect(prompt).toContain('口语练习');
  });

  it('includes the session type label for review', () => {
    const prompt = buildSessionExtractionPrompt(formattedMessages, 'review');
    expect(prompt).toContain('复习练习');
  });

  it('includes topic info when provided', () => {
    const prompt = buildSessionExtractionPrompt(
      formattedMessages, sessionType, 'Travel experiences',
    );
    expect(prompt).toContain('Travel experiences');
    expect(prompt).toContain('练习话题');
  });

  it('omits topic section when topicInfo is not provided', () => {
    const prompt = buildSessionExtractionPrompt(formattedMessages, sessionType);
    expect(prompt).not.toContain('练习话题');
  });

  it('returns a non-empty string', () => {
    const prompt = buildSessionExtractionPrompt(formattedMessages, sessionType);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});
