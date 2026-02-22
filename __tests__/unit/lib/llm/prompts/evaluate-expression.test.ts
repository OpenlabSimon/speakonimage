import {
  ExpressionEvaluationSchema,
  getExpressionEvaluationSystemPrompt,
  buildExpressionEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-expression';
import fixture from '../../../../mocks/fixtures/evaluation-expression.json';

// ---------------------------------------------------------------------------
// ExpressionEvaluationSchema — fixture validation
// ---------------------------------------------------------------------------

describe('ExpressionEvaluationSchema', () => {
  it('validates a well-formed expression evaluation fixture', () => {
    const result = ExpressionEvaluationSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing relevance', () => {
    const { relevance: _, ...incomplete } = fixture;
    const result = ExpressionEvaluationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing depth', () => {
    const { depth: _, ...incomplete } = fixture;
    const result = ExpressionEvaluationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing languageQuality', () => {
    const { languageQuality: _, ...incomplete } = fixture;
    const result = ExpressionEvaluationSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects a relevance score above 100', () => {
    const result = ExpressionEvaluationSchema.safeParse({
      ...fixture,
      relevance: { ...fixture.relevance, score: 101 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a depth score below 0', () => {
    const result = ExpressionEvaluationSchema.safeParse({
      ...fixture,
      depth: { ...fixture.depth, score: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CEFR estimate', () => {
    const result = ExpressionEvaluationSchema.safeParse({
      ...fixture,
      overallCefrEstimate: 'X9',
    });
    expect(result.success).toBe(false);
  });

  it('rejects data with wrong type literal', () => {
    const result = ExpressionEvaluationSchema.safeParse({
      ...fixture,
      type: 'translation',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Severity transform (languageQuality.grammarErrors)
// ---------------------------------------------------------------------------

describe('ExpressionEvaluationSchema severity transform', () => {
  const makeFixtureWithSeverity = (severity: string) => ({
    ...fixture,
    languageQuality: {
      ...fixture.languageQuality,
      grammarErrors: [
        {
          original: 'more better',
          corrected: 'much better',
          rule: 'Double comparative',
          severity,
        },
      ],
    },
  });

  it('transforms "Major" to "high"', () => {
    const result = ExpressionEvaluationSchema.parse(makeFixtureWithSeverity('Major'));
    expect(result.languageQuality.grammarErrors[0].severity).toBe('high');
  });

  it('transforms "moderate" to "medium"', () => {
    const result = ExpressionEvaluationSchema.parse(makeFixtureWithSeverity('moderate'));
    expect(result.languageQuality.grammarErrors[0].severity).toBe('medium');
  });

  it('transforms "minor" to "low"', () => {
    const result = ExpressionEvaluationSchema.parse(makeFixtureWithSeverity('minor'));
    expect(result.languageQuality.grammarErrors[0].severity).toBe('low');
  });

  it('transforms an unrecognised value to "low"', () => {
    const result = ExpressionEvaluationSchema.parse(makeFixtureWithSeverity('negligible'));
    expect(result.languageQuality.grammarErrors[0].severity).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// getExpressionEvaluationSystemPrompt
// ---------------------------------------------------------------------------

describe('getExpressionEvaluationSystemPrompt', () => {
  it('returns a non-empty string for text input (default)', () => {
    const prompt = getExpressionEvaluationSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes voice-specific content when inputMethod is voice', () => {
    const prompt = getExpressionEvaluationSystemPrompt('voice');
    expect(prompt).toContain('口语');
  });

  it('does not include voice-specific content for text mode', () => {
    const textPrompt = getExpressionEvaluationSystemPrompt('text');
    expect(textPrompt).not.toContain('口语流畅度');
  });
});

// ---------------------------------------------------------------------------
// buildExpressionEvaluationPrompt
// ---------------------------------------------------------------------------

describe('buildExpressionEvaluationPrompt', () => {
  const chinesePrompt = '描述一次让你印象深刻的旅行经历';
  const guidingQuestions = ['你去了哪里？', '最难忘的是什么？'];
  const userResponse = 'I visited the Great Wall last summer. It was amazing.';
  const suggestedVocab = ['breathtaking', 'memorable', 'explore'];
  const grammarHints = ['Past Tense Narrative'];

  it('includes the Chinese prompt', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    expect(prompt).toContain(chinesePrompt);
  });

  it('includes all guiding questions', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    for (const q of guidingQuestions) {
      expect(prompt).toContain(q);
    }
  });

  it('includes the user response', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    expect(prompt).toContain(userResponse);
  });

  it('includes suggested vocabulary', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    for (const v of suggestedVocab) {
      expect(prompt).toContain(v);
    }
  });

  it('includes grammar hints', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    for (const g of grammarHints) {
      expect(prompt).toContain(g);
    }
  });

  it('includes history attempts when provided', () => {
    const history = [{ text: 'attempt one', score: 60 }];
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
      history,
    );
    expect(prompt).toContain('attempt one');
    expect(prompt).toContain('60');
    expect(prompt).toContain('历史尝试');
  });

  it('omits history section when not provided', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
    );
    expect(prompt).not.toContain('历史尝试');
  });

  it('includes profile context when provided', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
      undefined, 'Intermediate learner focusing on creativity',
    );
    expect(prompt).toContain('Intermediate learner focusing on creativity');
    expect(prompt).toContain('学生背景');
  });

  it('mentions voice-specific label when inputMethod is voice', () => {
    const prompt = buildExpressionEvaluationPrompt(
      chinesePrompt, guidingQuestions, userResponse, suggestedVocab, grammarHints,
      undefined, undefined, 'voice',
    );
    expect(prompt).toContain('语音转写');
  });
});
