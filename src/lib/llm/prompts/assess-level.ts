import { z } from 'zod';

// ============================================
// Introduction Assessment Schema
// ============================================

const CEFRLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export const IntroductionAssessmentSchema = z.object({
  estimatedLevel: CEFRLevelSchema.describe('Overall estimated CEFR level'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence in the assessment (0-1)'),
  analysis: z.object({
    vocabularyLevel: CEFRLevelSchema.describe('CEFR level based on vocabulary'),
    grammarLevel: CEFRLevelSchema.describe('CEFR level based on grammar'),
    englishRatio: z
      .number()
      .min(0)
      .max(1)
      .describe('Ratio of English vs Chinese content (0-1)'),
    observations: z
      .array(z.string())
      .min(1)
      .max(5)
      .describe('Specific observations about the language use'),
  }),
});

export type IntroductionAssessment = z.infer<typeof IntroductionAssessmentSchema>;

// ============================================
// System Prompt
// ============================================

export const ASSESS_LEVEL_SYSTEM_PROMPT = `You are an expert English language assessor specializing in CEFR level evaluation.

Your task is to analyze a self-introduction that mixes English and Chinese (code-switching), and estimate the user's English proficiency level.

Assessment Criteria:

1. **Vocabulary Analysis**:
   - A1-A2: Basic everyday words (hello, my name, work, like)
   - B1: Common collocations, some phrasal verbs
   - B2: Idiomatic expressions, precise vocabulary
   - C1-C2: Sophisticated vocabulary, nuanced word choices

2. **Grammar Analysis**:
   - A1: Simple present, basic sentence structures
   - A2: Past tense, questions, negatives
   - B1: Conditionals, perfect tenses
   - B2: Complex sentences, passive voice
   - C1-C2: Advanced grammar, subtle tense distinctions

3. **Code-Switching Patterns**:
   - More English = higher proficiency indication
   - Strategic mixing (English for complex ideas) vs reliance on Chinese

4. **Confidence Scoring**:
   - Short samples (< 30 words) → lower confidence (0.3-0.5)
   - Medium samples (30-60 words) → moderate confidence (0.5-0.7)
   - Longer samples (> 60 words) → higher confidence (0.7-0.9)

Be encouraging but accurate. When in doubt, estimate slightly lower to provide appropriate challenge.

Always return valid JSON matching the schema.`;

// ============================================
// Prompt Builder
// ============================================

/**
 * Build the prompt for analyzing a mixed-language introduction
 */
export function buildIntroductionAssessmentPrompt(introductionText: string): string {
  return `Analyze the following self-introduction and estimate the user's English CEFR level.

The introduction mixes English and Chinese (code-switching style):

"""
${introductionText}
"""

Provide your assessment in JSON format with:
1. estimatedLevel: The overall CEFR level (A1, A2, B1, B2, C1, or C2)
2. confidence: Your confidence in this assessment (0-1)
3. analysis:
   - vocabularyLevel: CEFR level based on vocabulary used
   - grammarLevel: CEFR level based on grammar structures
   - englishRatio: Proportion of English content (0-1)
   - observations: 1-5 specific observations about their language use

Focus on the English portions. Be fair but encouraging.

Return only valid JSON, no markdown formatting.`;
}
