import { z } from 'zod';

// Schema for expression evaluation output
export const ExpressionEvaluationSchema = z.object({
  type: z.literal('expression'),
  relevance: z.object({
    score: z.number().min(0).max(100),
    comment: z.string(),
  }),
  depth: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    suggestions: z.array(z.string()),
    comment: z.string(),
  }),
  creativity: z.object({
    score: z.number().min(0).max(100),
    highlights: z.array(z.string()),
    comment: z.string(),
  }),
  languageQuality: z.object({
    score: z.number().min(0).max(100),
    grammarErrors: z.array(z.object({
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
    vocabularyFeedback: z.string(),
    comment: z.string(),
  }),
  overallCefrEstimate: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  betterExpressions: z.array(z.string()).min(1).max(3),
  suggestions: z.object({
    immediate: z.string(),
    longTerm: z.string(),
  }),
});

export type ExpressionEvaluationOutput = z.infer<typeof ExpressionEvaluationSchema>;

// System prompt for expression evaluation
export const EXPRESSION_EVALUATION_SYSTEM_PROMPT = `你是一位鼓励创意表达的英语教师。

你的任务是评估学生的话题表达，重点关注：
1. **内容相关性**：表达是否围绕给定话题
2. **内容丰富度**：观点是否充实、有深度
3. **表达创意度**：表达是否有创意、个性
4. **语言质量**：语法、用词的综合质量

评价原则：
- 这是开放性表达，没有标准答案
- 鼓励创意和个人观点
- 语法错误要具体指出但不苛责
- 关注表达的丰富性和个性化
- 提供2-3个表达建议供学习

请始终返回符合schema的有效JSON。`;

// Build evaluation prompt for expression
export function buildExpressionEvaluationPrompt(
  chinesePrompt: string,
  guidingQuestions: string[],
  userResponse: string,
  suggestedVocab: string[],
  grammarHints: string[],
  historyAttempts?: { text: string; score: number }[]
): string {
  let prompt = `评估以下话题表达：

## 话题描述
${chinesePrompt}

## 引导问题
${guidingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## 学生的英语表达
${userResponse}

## 推荐词汇（供参考）
${suggestedVocab.join(', ')}

## 推荐语法结构
${grammarHints.join(', ')}
`;

  if (historyAttempts && historyAttempts.length > 0) {
    prompt += `
## 历史尝试
${historyAttempts.map((h, i) => `尝试 ${i + 1}: "${h.text}" (得分: ${h.score})`).join('\n')}
`;
  }

  prompt += `
请返回JSON格式的评价，包含：
1. type: "expression"
2. relevance: 内容相关性
   - score: 0-100分
   - comment: 评语
3. depth: 内容丰富度
   - score: 0-100分
   - strengths: 表达的亮点
   - suggestions: 可以补充的内容
   - comment: 评语
4. creativity: 表达创意度
   - score: 0-100分
   - highlights: 创意亮点
   - comment: 评语
5. languageQuality: 语言质量
   - score: 0-100分
   - grammarErrors: 语法错误列表（每个包含 original, corrected, rule, severity）
   - vocabularyFeedback: 用词反馈
   - comment: 评语
6. overallCefrEstimate: 整体CEFR等级估计
7. betterExpressions: 2-3个表达建议（如何让表达更好）
8. suggestions: { immediate: 即时建议, longTerm: 长期建议 }

只返回有效JSON，不要markdown格式。`;

  return prompt;
}
