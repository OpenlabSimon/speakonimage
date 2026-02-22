import {
  IntroductionAssessmentSchema,
  buildIntroductionAssessmentPrompt,
} from '@/lib/llm/prompts/assess-level';
import fixture from '../../../../mocks/fixtures/assessment.json';

// ---------------------------------------------------------------------------
// IntroductionAssessmentSchema — fixture validation
// ---------------------------------------------------------------------------

describe('IntroductionAssessmentSchema', () => {
  it('validates a well-formed assessment fixture', () => {
    const result = IntroductionAssessmentSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing estimatedLevel', () => {
    const { estimatedLevel: _, ...incomplete } = fixture;
    const result = IntroductionAssessmentSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing confidence', () => {
    const { confidence: _, ...incomplete } = fixture;
    const result = IntroductionAssessmentSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing analysis', () => {
    const { analysis: _, ...incomplete } = fixture;
    const result = IntroductionAssessmentSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CEFR estimatedLevel', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      estimatedLevel: 'Z3',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Confidence bounds (0-1)
// ---------------------------------------------------------------------------

describe('IntroductionAssessmentSchema confidence bounds', () => {
  it('accepts confidence of 0', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      confidence: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts confidence of 1', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      confidence: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts confidence of 0.5', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      confidence: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence greater than 1', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      confidence: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence less than 0', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Analysis sub-fields
// ---------------------------------------------------------------------------

describe('IntroductionAssessmentSchema analysis', () => {
  it('rejects an invalid vocabularyLevel', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      analysis: { ...fixture.analysis, vocabularyLevel: 'X1' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid grammarLevel', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      analysis: { ...fixture.analysis, grammarLevel: 'X1' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects englishRatio above 1', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      analysis: { ...fixture.analysis, englishRatio: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects englishRatio below 0', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      analysis: { ...fixture.analysis, englishRatio: -0.2 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty observations array', () => {
    const result = IntroductionAssessmentSchema.safeParse({
      ...fixture,
      analysis: { ...fixture.analysis, observations: [] },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildIntroductionAssessmentPrompt
// ---------------------------------------------------------------------------

describe('buildIntroductionAssessmentPrompt', () => {
  it('includes the introduction text', () => {
    const text = 'Hello, my name is 小明. I like to play basketball.';
    const prompt = buildIntroductionAssessmentPrompt(text);
    expect(prompt).toContain(text);
  });

  it('returns a non-empty string', () => {
    const prompt = buildIntroductionAssessmentPrompt('任何文字');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('mentions CEFR in the prompt', () => {
    const prompt = buildIntroductionAssessmentPrompt('Hi, 我叫小明');
    expect(prompt).toContain('CEFR');
  });
});
