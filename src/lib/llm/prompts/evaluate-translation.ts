import { z } from 'zod';
import { normalizeCefrLevel } from '@/lib/cefr';
import { withEvaluationLevel } from '@/lib/evaluation/evaluators/levels';

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
  semanticAccuracy: withEvaluationLevel({
    conveyedPoints: z.array(SemanticPointSchema),
    missedPoints: z.array(SemanticPointSchema),
    comment: z.string(),
  }),
  naturalness: withEvaluationLevel({
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
    comment: z.string(),
  }),
  grammar: withEvaluationLevel({
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
  vocabulary: withEvaluationLevel({
    goodChoices: z.array(z.string()),
    improvements: z.array(z.string()),
    comment: z.string(),
  }),
  overallCefrEstimate: z
    .string()
    .transform((value) => normalizeCefrLevel(value)),
  betterExpressions: z.array(z.string()).min(1).max(3),
  suggestions: z.object({
    immediate: z.string(),
    longTerm: z.string(),
  }),
});

export type TranslationEvaluationOutput = z.infer<typeof TranslationEvaluationSchema>;

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildHistorySummary(historyAttempts?: { text: string; score: number }[]): string | null {
  if (!historyAttempts || historyAttempts.length === 0) return null;

  const latest = historyAttempts[historyAttempts.length - 1];

  return [
    `count=${historyAttempts.length}`,
    `last_text="${compactText(latest.text, 80)}"`,
  ].join('; ');
}

// System prompt for translation evaluation
export function getTranslationEvaluationSystemPrompt(inputMethod: 'voice' | 'text' = 'text'): string {
  const base = `你是一位专注于语义传达的英语教师。

你的任务是评估学生的中译英翻译，重点关注：
1. **语义传达准确性**：学生是否准确传达了中文原意（不要求逐字翻译）
2. **表达自然度**：英语是否地道，是否有中式英语痕迹
3. **语法正确性**：是否有语法错误
4. **用词质量**：用词是否恰当`;

  const voiceExtra = inputMethod === 'voice' ? `
5. **口语流畅度**：作为口语表达，是否流畅自然

特别注意：这是学生的口语录音转写文本。评估时请考虑：
- 口语中的自我纠正（如 "I go... went"）是积极的学习信号，不应过度扣分
- 口语中的语法容忍度可以略高于书面表达
- 关注口语特有的问题：填充词过多、句子断裂、长停顿重启等
- 在naturalness评分中反映口语流畅度` : '';

  return base + voiceExtra + `

评价原则：
- 同一中文可以有多种正确的英语表达，全部认可
- 重点是意思对不对，不是字面对应
- 对创意表达要鼓励，只要语义正确
- 语法错误要具体指出并给出修正
- 提供2-3个更好的表达方式供学习
- 不要输出数字分数，所有维度只用 level 表示

请始终返回符合schema的有效JSON。`;
}

// Keep backward-compatible constant
export const TRANSLATION_EVALUATION_SYSTEM_PROMPT = getTranslationEvaluationSystemPrompt('text');

// Build evaluation prompt for translation
export function buildTranslationEvaluationPrompt(
  chinesePrompt: string,
  keyPoints: string[],
  userResponse: string,
  suggestedVocab: string[],
  historyAttempts?: { text: string; score: number }[],
  profileContext?: string,
  inputMethod: 'voice' | 'text' = 'text'
): string {
  const inputLabel = inputMethod === 'voice' ? '学生的英语口语表达（语音转写）' : '学生的英语表达';
  let prompt = `评估以下中译英翻译${inputMethod === 'voice' ? '（口语）' : ''}：

## 中文原文
${chinesePrompt}

## 翻译要点（用于评估语义传达）
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## ${inputLabel}
${userResponse}

## 推荐词汇（供参考）
${suggestedVocab.join(', ')}
`;

  const historySummary = buildHistorySummary(historyAttempts);
  if (historySummary) {
    prompt += `
## 历史摘要
${historySummary}
`;
  }

  if (profileContext) {
    prompt += `
## 画像参考
${profileContext}
`;
  }

  prompt += `
请返回JSON格式的评价，包含：
1. type: "translation"
2. semanticAccuracy: 语义准确度评估
   - level: 从 excellent / strong / solid / developing / limited 里选一个
   - conveyedPoints: 正确传达的要点（每个要点标注是否传达）
   - missedPoints: 遗漏或错误的要点
   - comment: 总体评语
3. naturalness: 表达自然度
   - level: 从 excellent / strong / solid / developing / limited 里选一个
   - issues: 不地道的表达列表
   - suggestions: 更地道的建议
   - comment: 评语
4. grammar: 语法评估
   - level: 从 excellent / strong / solid / developing / limited 里选一个
   - errors: 错误列表（每个包含 original, corrected, rule, severity）
5. vocabulary: 用词评估
   - level: 从 excellent / strong / solid / developing / limited 里选一个
   - goodChoices: 用词恰当之处
   - improvements: 可改进的用词
   - comment: 评语
6. overallCefrEstimate: 整体CEFR等级估计
7. betterExpressions: 2-3个更好的表达方式
8. suggestions: { immediate: 即时建议, longTerm: 长期建议 }

不要返回任何数字分数，只返回 level。
只返回有效JSON，不要markdown格式。`;

  return prompt;
}
