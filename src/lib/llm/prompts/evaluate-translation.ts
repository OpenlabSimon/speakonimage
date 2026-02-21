import { z } from 'zod';

// Schema for semantic point - can be string or object
const SemanticPointSchema = z.union([
  z.string(),
  z.object({
    point: z.string(),
    conveyed: z.boolean().optional(),
    comment: z.string().optional(),
  }),
]);

// Schema for translation evaluation output
export const TranslationEvaluationSchema = z.object({
  type: z.literal('translation'),
  semanticAccuracy: z.object({
    score: z.number().min(0).max(100),
    conveyedPoints: z.array(SemanticPointSchema),
    missedPoints: z.array(SemanticPointSchema),
    comment: z.string(),
  }),
  naturalness: z.object({
    score: z.number().min(0).max(100),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
    comment: z.string(),
  }),
  grammar: z.object({
    score: z.number().min(0).max(100),
    errors: z.array(z.object({
      original: z.string(),
      corrected: z.string(),
      rule: z.string(),
      severity: z.string().transform(s => {
        const lower = s.toLowerCase();
        if (lower.includes('high') || lower.includes('major') || lower.includes('severe') || lower.includes('serious')) return 'high';
        if (lower.includes('medium') || lower.includes('moderate') || lower.includes('mid')) return 'medium';
        return 'low';
      }),
    })),
  }),
  vocabulary: z.object({
    score: z.number().min(0).max(100),
    goodChoices: z.array(z.string()),
    improvements: z.array(z.string()),
    comment: z.string(),
  }),
  overallCefrEstimate: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  betterExpressions: z.array(z.string()).min(1).max(3),
  suggestions: z.object({
    immediate: z.string(),
    longTerm: z.string(),
  }),
});

export type TranslationEvaluationOutput = z.infer<typeof TranslationEvaluationSchema>;

// System prompt for translation evaluation
export const TRANSLATION_EVALUATION_SYSTEM_PROMPT = `你是一位专注于语义传达的英语教师。

你的任务是评估学生的中译英翻译，重点关注：
1. **语义传达准确性**：学生是否准确传达了中文原意（不要求逐字翻译）
2. **表达自然度**：英语是否地道，是否有中式英语痕迹
3. **语法正确性**：是否有语法错误
4. **用词质量**：用词是否恰当

评价原则：
- 同一中文可以有多种正确的英语表达，全部认可
- 重点是意思对不对，不是字面对应
- 对创意表达要鼓励，只要语义正确
- 语法错误要具体指出并给出修正
- 提供2-3个更好的表达方式供学习

请始终返回符合schema的有效JSON。`;

// Build evaluation prompt for translation
export function buildTranslationEvaluationPrompt(
  chinesePrompt: string,
  keyPoints: string[],
  userResponse: string,
  suggestedVocab: string[],
  historyAttempts?: { text: string; score: number }[]
): string {
  let prompt = `评估以下中译英翻译：

## 中文原文
${chinesePrompt}

## 翻译要点（用于评估语义传达）
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## 学生的英语表达
${userResponse}

## 推荐词汇（供参考）
${suggestedVocab.join(', ')}
`;

  if (historyAttempts && historyAttempts.length > 0) {
    prompt += `
## 历史尝试
${historyAttempts.map((h, i) => `尝试 ${i + 1}: "${h.text}" (得分: ${h.score})`).join('\n')}
`;
  }

  prompt += `
请返回JSON格式的评价，包含：
1. type: "translation"
2. semanticAccuracy: 语义准确度评估
   - score: 0-100分
   - conveyedPoints: 正确传达的要点（每个要点标注是否传达）
   - missedPoints: 遗漏或错误的要点
   - comment: 总体评语
3. naturalness: 表达自然度
   - score: 0-100分
   - issues: 不地道的表达列表
   - suggestions: 更地道的建议
   - comment: 评语
4. grammar: 语法评估
   - score: 0-100分
   - errors: 错误列表（每个包含 original, corrected, rule, severity）
5. vocabulary: 用词评估
   - score: 0-100分
   - goodChoices: 用词恰当之处
   - improvements: 可改进的用词
   - comment: 评语
6. overallCefrEstimate: 整体CEFR等级估计
7. betterExpressions: 2-3个更好的表达方式
8. suggestions: { immediate: 即时建议, longTerm: 长期建议 }

只返回有效JSON，不要markdown格式。`;

  return prompt;
}
