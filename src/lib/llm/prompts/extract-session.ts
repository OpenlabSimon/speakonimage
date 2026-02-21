// LLM prompt for extracting learning data from session conversations

import { z } from 'zod';

// Helper: coerce a single string to an array
const stringOrArray = z.union([
  z.array(z.string()),
  z.string().transform((s) => s ? [s] : []),
]).default([]);

// Schema for extracted vocabulary
const ExtractedVocabularySchema = z.object({
  word: z.string(),
  context: z.string().default(''),
  mastery: z.string().default('new'),
  cefrLevel: z.string().optional(),
});

// Schema for extracted error - all fields optional with defaults for LLM resilience
const ExtractedErrorSchema = z.object({
  type: z.string().default('unknown'),
  userSaid: z.string().default(''),
  correction: z.string().default(''),
  pattern: z.string().default(''),
  severity: z.string().default('medium'),
  isRecurring: z.boolean().default(false),
});

// Full extraction result schema with lenient defaults
export const SessionExtractionSchema = z.object({
  sessionSummary: z.string().default(''),
  newVocabulary: z.array(ExtractedVocabularySchema).default([]),
  errors: z.array(ExtractedErrorSchema).default([]),
  grammarPointsTouched: stringOrArray,
  topicsDiscussed: stringOrArray,
  suggestedFocusNext: stringOrArray,
  overallProgress: z.string().default('stable'),
});

export type SessionExtractionResult = z.infer<typeof SessionExtractionSchema>;

// System prompt for extraction
export const SESSION_EXTRACTION_SYSTEM_PROMPT = `你是一个英语学习分析专家。你的任务是分析学生的练习对话，提取学习数据。

分析时请注意：
1. 客观评估学生表现，既指出错误也肯定进步
2. 错误模式要概括性总结，便于追踪
3. 词汇掌握程度根据使用情况判断：
   - new: 首次接触或明显不熟
   - developing: 能使用但有错误
   - mastered: 使用准确自然
4. 建议下次重点要具体可行
5. 所有数组字段必须返回数组，不要返回单个字符串

请用JSON格式输出，严格遵循schema。`;

// Build extraction prompt
export function buildSessionExtractionPrompt(
  formattedMessages: string,
  sessionType: string,
  topicInfo?: string
): string {
  let prompt = `请分析以下英语练习对话，提取学习数据。

## 练习类型
${sessionType === 'practice' ? '口语练习' : '复习练习'}
`;

  if (topicInfo) {
    prompt += `
## 练习话题
${topicInfo}
`;
  }

  prompt += `
## 对话记录
${formattedMessages}

## 提取要求
请从对话中提取以下JSON结构：
{
  "sessionSummary": "一句话总结本次练习",
  "newVocabulary": [{"word": "词汇", "context": "使用语境", "mastery": "new/developing/mastered", "cefrLevel": "A1-C2"}],
  "errors": [{"type": "错误类型", "userSaid": "学生原话", "correction": "正确表达", "pattern": "错误模式", "severity": "low/medium/high", "isRecurring": false}],
  "grammarPointsTouched": ["past_tense", "articles"],
  "topicsDiscussed": ["cooking", "family"],
  "suggestedFocusNext": ["建议1", "建议2"],
  "overallProgress": "improving/stable/struggling"
}

注意：所有数组字段必须是数组格式，即使只有一项也要用 ["item"] 格式。`;

  return prompt;
}
