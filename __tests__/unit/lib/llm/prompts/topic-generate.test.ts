import {
  buildTranslationPrompt,
  buildExpressionPrompt,
  buildUnifiedPrompt,
  buildTopicPrompt,
  getSchemaForType,
  getSystemPromptForType,
  TranslationTopicSchema,
  ExpressionTopicSchema,
  TopicGenerationSchema,
  TRANSLATION_SYSTEM_PROMPT,
  EXPRESSION_SYSTEM_PROMPT,
} from '@/lib/llm/prompts/topic-generate';
import translationFixture from '../../../../mocks/fixtures/topic-translation.json';
import expressionFixture from '../../../../mocks/fixtures/topic-expression.json';

describe('buildTranslationPrompt', () => {
  it('includes the user input text', () => {
    const prompt = buildTranslationPrompt('咖啡店偶遇');
    expect(prompt).toContain('咖啡店偶遇');
  });

  it('includes the target CEFR level', () => {
    const prompt = buildTranslationPrompt('咖啡店偶遇', 'B2');
    expect(prompt).toContain('B2');
  });

  it('defaults to B1 when no CEFR level is provided', () => {
    const prompt = buildTranslationPrompt('test input');
    expect(prompt).toContain('B1');
  });
});

describe('buildExpressionPrompt', () => {
  it('includes the user input text', () => {
    const prompt = buildExpressionPrompt('周末计划');
    expect(prompt).toContain('周末计划');
  });

  it('includes the target CEFR level', () => {
    const prompt = buildExpressionPrompt('周末计划', 'C1');
    expect(prompt).toContain('C1');
  });

  it('defaults to B1 when no CEFR level is provided', () => {
    const prompt = buildExpressionPrompt('旅行经历');
    expect(prompt).toContain('B1');
  });
});

describe('buildUnifiedPrompt', () => {
  it('includes the user input text', () => {
    const prompt = buildUnifiedPrompt('如果明天下雨');
    expect(prompt).toContain('如果明天下雨');
  });

  it('includes the target CEFR level', () => {
    const prompt = buildUnifiedPrompt('如果明天下雨', 'A2');
    expect(prompt).toContain('A2');
  });

  it('defaults to B1 when no CEFR level is provided', () => {
    const prompt = buildUnifiedPrompt('some topic');
    expect(prompt).toContain('B1');
  });
});

describe('buildTopicPrompt', () => {
  it('delegates to buildTranslationPrompt for translation type', () => {
    const prompt = buildTopicPrompt('translation', '你好世界', 'A1');
    expect(prompt).toContain('你好世界');
    expect(prompt).toContain('A1');
    expect(prompt).toContain('翻译挑战');
  });

  it('delegates to buildExpressionPrompt for expression type', () => {
    const prompt = buildTopicPrompt('expression', '周末', 'B2');
    expect(prompt).toContain('周末');
    expect(prompt).toContain('B2');
    expect(prompt).toContain('话题表达');
  });
});

describe('getSchemaForType', () => {
  it('returns TranslationTopicSchema for translation', () => {
    expect(getSchemaForType('translation')).toBe(TranslationTopicSchema);
  });

  it('returns ExpressionTopicSchema for expression', () => {
    expect(getSchemaForType('expression')).toBe(ExpressionTopicSchema);
  });
});

describe('getSystemPromptForType', () => {
  it('returns the translation system prompt for translation', () => {
    expect(getSystemPromptForType('translation')).toBe(TRANSLATION_SYSTEM_PROMPT);
  });

  it('returns the expression system prompt for expression', () => {
    expect(getSystemPromptForType('expression')).toBe(EXPRESSION_SYSTEM_PROMPT);
  });
});

describe('TranslationTopicSchema', () => {
  it('validates a well-formed translation fixture', () => {
    const result = TranslationTopicSchema.safeParse(translationFixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing chinesePrompt', () => {
    const { chinesePrompt: _, ...incomplete } = translationFixture;
    const result = TranslationTopicSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing keyPoints', () => {
    const { keyPoints: _, ...incomplete } = translationFixture;
    const result = TranslationTopicSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with wrong type literal', () => {
    const result = TranslationTopicSchema.safeParse({
      ...translationFixture,
      type: 'expression',
    });
    expect(result.success).toBe(false);
  });

  it('rejects vocabComplexity outside 0-1 range', () => {
    const result = TranslationTopicSchema.safeParse({
      ...translationFixture,
      difficultyMetadata: {
        ...translationFixture.difficultyMetadata,
        vocabComplexity: 1.5,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CEFR difficulty value', () => {
    const result = TranslationTopicSchema.safeParse({
      ...translationFixture,
      difficulty: 'D1',
    });
    expect(result.success).toBe(false);
  });
});

describe('ExpressionTopicSchema', () => {
  it('validates a well-formed expression fixture', () => {
    const result = ExpressionTopicSchema.safeParse(expressionFixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with missing guidingQuestions', () => {
    const { guidingQuestions: _, ...incomplete } = expressionFixture;
    const result = ExpressionTopicSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with missing grammarHints', () => {
    const { grammarHints: _, ...incomplete } = expressionFixture;
    const result = ExpressionTopicSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects data with wrong type literal', () => {
    const result = ExpressionTopicSchema.safeParse({
      ...expressionFixture,
      type: 'translation',
    });
    expect(result.success).toBe(false);
  });

  it('rejects grammarComplexity outside 0-1 range', () => {
    const result = ExpressionTopicSchema.safeParse({
      ...expressionFixture,
      difficultyMetadata: {
        ...expressionFixture.difficultyMetadata,
        grammarComplexity: -0.1,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('TopicGenerationSchema', () => {
  it('accepts valid translation data', () => {
    const result = TopicGenerationSchema.safeParse(translationFixture);
    expect(result.success).toBe(true);
  });

  it('accepts valid expression data', () => {
    const result = TopicGenerationSchema.safeParse(expressionFixture);
    expect(result.success).toBe(true);
  });

  it('rejects data with unknown type', () => {
    const result = TopicGenerationSchema.safeParse({
      ...translationFixture,
      type: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});
