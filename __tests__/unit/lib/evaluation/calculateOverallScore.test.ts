import { calculateOverallScore } from '@/lib/evaluation/evaluateSubmission';
import type { TranslationEvaluationOutput } from '@/lib/llm/prompts/evaluate-translation';
import type { ExpressionEvaluationOutput } from '@/lib/llm/prompts/evaluate-expression';

// Helper to build a minimal translation evaluation with only score fields
function translationEval(scores: {
  semanticAccuracy: number;
  naturalness: number;
  grammar: number;
  vocabulary: number;
}): TranslationEvaluationOutput {
  return {
    type: 'translation',
    semanticAccuracy: { score: scores.semanticAccuracy },
    naturalness: { score: scores.naturalness },
    grammar: { score: scores.grammar },
    vocabulary: { score: scores.vocabulary },
  } as unknown as TranslationEvaluationOutput;
}

// Helper to build a minimal expression evaluation with only score fields
function expressionEval(scores: {
  relevance: number;
  depth: number;
  creativity: number;
  languageQuality: number;
}): ExpressionEvaluationOutput {
  return {
    type: 'expression',
    relevance: { score: scores.relevance },
    depth: { score: scores.depth },
    creativity: { score: scores.creativity },
    languageQuality: { score: scores.languageQuality },
  } as unknown as ExpressionEvaluationOutput;
}

describe('calculateOverallScore', () => {
  describe('translation weighting (0.4 / 0.2 / 0.2 / 0.2)', () => {
    it('weights semanticAccuracy at 0.4', () => {
      const eval1 = translationEval({
        semanticAccuracy: 100,
        naturalness: 0,
        grammar: 0,
        vocabulary: 0,
      });
      // 100*0.4 + 0*0.2 + 0*0.2 + 0*0.2 = 40
      expect(calculateOverallScore(eval1)).toBe(40);
    });

    it('weights naturalness at 0.2', () => {
      const eval1 = translationEval({
        semanticAccuracy: 0,
        naturalness: 100,
        grammar: 0,
        vocabulary: 0,
      });
      // 0*0.4 + 100*0.2 + 0*0.2 + 0*0.2 = 20
      expect(calculateOverallScore(eval1)).toBe(20);
    });

    it('weights grammar at 0.2', () => {
      const eval1 = translationEval({
        semanticAccuracy: 0,
        naturalness: 0,
        grammar: 100,
        vocabulary: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(20);
    });

    it('weights vocabulary at 0.2', () => {
      const eval1 = translationEval({
        semanticAccuracy: 0,
        naturalness: 0,
        grammar: 0,
        vocabulary: 100,
      });
      expect(calculateOverallScore(eval1)).toBe(20);
    });
  });

  describe('expression weighting (equal 0.25 each)', () => {
    it('weights relevance at 0.25', () => {
      const eval1 = expressionEval({
        relevance: 100,
        depth: 0,
        creativity: 0,
        languageQuality: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(25);
    });

    it('weights depth at 0.25', () => {
      const eval1 = expressionEval({
        relevance: 0,
        depth: 100,
        creativity: 0,
        languageQuality: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(25);
    });

    it('weights creativity at 0.25', () => {
      const eval1 = expressionEval({
        relevance: 0,
        depth: 0,
        creativity: 100,
        languageQuality: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(25);
    });

    it('weights languageQuality at 0.25', () => {
      const eval1 = expressionEval({
        relevance: 0,
        depth: 0,
        creativity: 0,
        languageQuality: 100,
      });
      expect(calculateOverallScore(eval1)).toBe(25);
    });
  });

  describe('boundary values', () => {
    it('returns 100 when all translation scores are 100', () => {
      const eval1 = translationEval({
        semanticAccuracy: 100,
        naturalness: 100,
        grammar: 100,
        vocabulary: 100,
      });
      expect(calculateOverallScore(eval1)).toBe(100);
    });

    it('returns 0 when all translation scores are 0', () => {
      const eval1 = translationEval({
        semanticAccuracy: 0,
        naturalness: 0,
        grammar: 0,
        vocabulary: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(0);
    });

    it('returns 100 when all expression scores are 100', () => {
      const eval1 = expressionEval({
        relevance: 100,
        depth: 100,
        creativity: 100,
        languageQuality: 100,
      });
      expect(calculateOverallScore(eval1)).toBe(100);
    });

    it('returns 0 when all expression scores are 0', () => {
      const eval1 = expressionEval({
        relevance: 0,
        depth: 0,
        creativity: 0,
        languageQuality: 0,
      });
      expect(calculateOverallScore(eval1)).toBe(0);
    });
  });

  describe('mixed scores', () => {
    it('computes correct weighted translation score', () => {
      const eval1 = translationEval({
        semanticAccuracy: 90,
        naturalness: 80,
        grammar: 70,
        vocabulary: 60,
      });
      // 90*0.4 + 80*0.2 + 70*0.2 + 60*0.2 = 36 + 16 + 14 + 12 = 78
      expect(calculateOverallScore(eval1)).toBe(78);
    });

    it('computes correct weighted expression score', () => {
      const eval1 = expressionEval({
        relevance: 80,
        depth: 60,
        creativity: 40,
        languageQuality: 20,
      });
      // 80*0.25 + 60*0.25 + 40*0.25 + 20*0.25 = 20 + 15 + 10 + 5 = 50
      expect(calculateOverallScore(eval1)).toBe(50);
    });

    it('handles translation with high semantic but low others', () => {
      const eval1 = translationEval({
        semanticAccuracy: 95,
        naturalness: 30,
        grammar: 40,
        vocabulary: 35,
      });
      // 95*0.4 + 30*0.2 + 40*0.2 + 35*0.2 = 38 + 6 + 8 + 7 = 59
      expect(calculateOverallScore(eval1)).toBe(59);
    });
  });

  describe('rounding behavior', () => {
    it('rounds down when fractional part is less than 0.5', () => {
      // translation: 73*0.4 + 61*0.2 + 52*0.2 + 44*0.2
      // = 29.2 + 12.2 + 10.4 + 8.8 = 60.6 -> rounds to 61
      const eval1 = translationEval({
        semanticAccuracy: 73,
        naturalness: 61,
        grammar: 52,
        vocabulary: 44,
      });
      expect(calculateOverallScore(eval1)).toBe(
        Math.round(73 * 0.4 + 61 * 0.2 + 52 * 0.2 + 44 * 0.2)
      );
    });

    it('rounds up when fractional part is 0.5 or more', () => {
      // expression: 51*0.25 + 51*0.25 + 51*0.25 + 50*0.25
      // = 12.75 + 12.75 + 12.75 + 12.5 = 50.75 -> rounds to 51
      const eval1 = expressionEval({
        relevance: 51,
        depth: 51,
        creativity: 51,
        languageQuality: 50,
      });
      expect(calculateOverallScore(eval1)).toBe(51);
    });

    it('returns integer when input scores produce an exact integer', () => {
      const eval1 = translationEval({
        semanticAccuracy: 80,
        naturalness: 70,
        grammar: 60,
        vocabulary: 50,
      });
      // 80*0.4 + 70*0.2 + 60*0.2 + 50*0.2 = 32 + 14 + 12 + 10 = 68
      const result = calculateOverallScore(eval1);
      expect(result).toBe(68);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('always returns an integer', () => {
      // Odd numbers that produce fractional intermediates
      const eval1 = translationEval({
        semanticAccuracy: 77,
        naturalness: 53,
        grammar: 41,
        vocabulary: 89,
      });
      const result = calculateOverallScore(eval1);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBe(
        Math.round(77 * 0.4 + 53 * 0.2 + 41 * 0.2 + 89 * 0.2)
      );
    });
  });
});
