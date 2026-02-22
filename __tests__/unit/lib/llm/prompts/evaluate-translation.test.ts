import {
  TranslationEvaluationSchema,
  getTranslationEvaluationSystemPrompt,
  buildTranslationEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-translation';
import fixture from '../../../../mocks/fixtures/evaluation-translation.json';

// ---------------------------------------------------------------------------
// TranslationEvaluationSchema — fixture validation
// ---------------------------------------------------------------------------

describe('TranslationEvaluationSchema', () => {
  it('validates a well-formed evaluation fixture', () => {
    const result = TranslationEvaluationSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing semanticAccuracy', () => {
    const { semanticAccuracy: _, ...incomplete } = fixture;
    const result = TranslationEvaluationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing grammar', () => {
    const { grammar: _, ...incomplete } = fixture;
    const result = TranslationEvaluationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects a semanticAccuracy score above 100', () => {
    const result = TranslationEvaluationSchema.safeParse({
      ...fixture,
      semanticAccuracy: { ...fixture.semanticAccuracy, score: 110 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a semanticAccuracy score below 0', () => {
    const result = TranslationEvaluationSchema.safeParse({
      ...fixture,
      semanticAccuracy: { ...fixture.semanticAccuracy, score: -5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CEFR estimate', () => {
    const result = TranslationEvaluationSchema.safeParse({
      ...fixture,
      overallCefrEstimate: 'D1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects data with wrong type literal', () => {
    const result = TranslationEvaluationSchema.safeParse({
      ...fixture,
      type: 'expression',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Severity transform
// ---------------------------------------------------------------------------

describe('TranslationEvaluationSchema severity transform', () => {
  const makeFixtureWithSeverity = (severity: string) => ({
    ...fixture,
    grammar: {
      ...fixture.grammar,
      errors: [
        {
          original: 'I have meet',
          corrected: 'I met',
          rule: 'Past tense usage',
          severity,
        },
      ],
    },
  });

  it('transforms "Major" to "high"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('Major'));
    expect(result.grammar.errors[0].severity).toBe('high');
  });

  it('transforms "severe" to "high"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('severe'));
    expect(result.grammar.errors[0].severity).toBe('high');
  });

  it('transforms "moderate" to "medium"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('moderate'));
    expect(result.grammar.errors[0].severity).toBe('medium');
  });

  it('transforms "Medium" to "medium"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('Medium'));
    expect(result.grammar.errors[0].severity).toBe('medium');
  });

  it('transforms "minor" to "low"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('minor'));
    expect(result.grammar.errors[0].severity).toBe('low');
  });

  it('transforms an unrecognised string to "low"', () => {
    const result = TranslationEvaluationSchema.parse(makeFixtureWithSeverity('trivial'));
    expect(result.grammar.errors[0].severity).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// getTranslationEvaluationSystemPrompt
// ---------------------------------------------------------------------------

describe('getTranslationEvaluationSystemPrompt', () => {
  it('returns a string for text input mode (default)', () => {
    const prompt = getTranslationEvaluationSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('returns a string for explicit text input', () => {
    const prompt = getTranslationEvaluationSystemPrompt('text');
    expect(typeof prompt).toBe('string');
  });

  it('includes voice-specific content when inputMethod is voice', () => {
    const prompt = getTranslationEvaluationSystemPrompt('voice');
    expect(prompt).toContain('口语');
  });

  it('does not include voice-specific content for text mode', () => {
    const textPrompt = getTranslationEvaluationSystemPrompt('text');
    expect(textPrompt).not.toContain('口语流畅度');
  });
});

// ---------------------------------------------------------------------------
// buildTranslationEvaluationPrompt
// ---------------------------------------------------------------------------

describe('buildTranslationEvaluationPrompt', () => {
  const chinesePrompt = '昨天我在咖啡店遇到了一个老朋友';
  const keyPoints = ['表达偶遇', '提到咖啡店'];
  const userResponse = 'I met an old friend at the coffee shop yesterday.';
  const suggestedVocab = ['run into', 'catch up', 'reminisce'];

  it('includes the Chinese prompt', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
    );
    expect(prompt).toContain(chinesePrompt);
  });

  it('includes all key points', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
    );
    for (const kp of keyPoints) {
      expect(prompt).toContain(kp);
    }
  });

  it('includes the user response', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
    );
    expect(prompt).toContain(userResponse);
  });

  it('includes suggested vocabulary', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
    );
    for (const v of suggestedVocab) {
      expect(prompt).toContain(v);
    }
  });

  it('includes history attempts when provided', () => {
    const history = [{ text: 'first try', score: 50 }];
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab, history,
    );
    expect(prompt).toContain('first try');
    expect(prompt).toContain('50');
    expect(prompt).toContain('历史尝试');
  });

  it('omits history section when not provided', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
    );
    expect(prompt).not.toContain('历史尝试');
  });

  it('includes profile context when provided', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
      undefined, 'Beginner learner, weak on tenses',
    );
    expect(prompt).toContain('Beginner learner, weak on tenses');
    expect(prompt).toContain('学生背景');
  });

  it('mentions voice-specific label when inputMethod is voice', () => {
    const prompt = buildTranslationEvaluationPrompt(
      chinesePrompt, keyPoints, userResponse, suggestedVocab,
      undefined, undefined, 'voice',
    );
    expect(prompt).toContain('语音转写');
  });
});
