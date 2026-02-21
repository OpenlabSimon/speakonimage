// LLM prompt for extracting learning data from session conversations

import { z } from 'zod';

// Schema for extracted vocabulary
const ExtractedVocabularySchema = z.object({
  word: z.string().describe('The vocabulary word'),
  context: z.string().describe('How the word was used in context'),
  mastery: z.enum(['new', 'developing', 'mastered']).describe('Estimated mastery level'),
  cefrLevel: z.string().optional().describe('Estimated CEFR level of the word'),
});

// Schema for extracted error
const ExtractedErrorSchema = z.object({
  type: z.string().describe('Grammar category: tense, article, preposition, word_order, etc.'),
  userSaid: z.string().describe('What the user said (with error)'),
  correction: z.string().describe('The corrected version'),
  pattern: z.string().describe('Generalized error pattern description'),
  severity: z.enum(['low', 'medium', 'high']).describe('Error severity'),
  isRecurring: z.boolean().describe('Whether this pattern appeared multiple times'),
});

// Full extraction result schema
export const SessionExtractionSchema = z.object({
  sessionSummary: z.string().describe('One-line summary of what happened in this session'),
  newVocabulary: z.array(ExtractedVocabularySchema).describe('New vocabulary introduced or practiced'),
  errors: z.array(ExtractedErrorSchema).describe('Errors made by the student'),
  grammarPointsTouched: z.array(z.string()).describe('Grammar points practiced (e.g., past_tense, articles, conditionals)'),
  topicsDiscussed: z.array(z.string()).describe('Topics/themes discussed (e.g., cooking, travel, work)'),
  suggestedFocusNext: z.array(z.string()).describe('Suggested focus areas for next session'),
  overallProgress: z.enum(['improving', 'stable', 'struggling']).describe('Overall progress assessment'),
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
请从对话中提取：
1. sessionSummary: 一句话总结本次练习
2. newVocabulary: 学生接触到的词汇（最多10个重点词汇）
3. errors: 学生犯的错误（概括相似错误，标注是否反复出现）
4. grammarPointsTouched: 涉及的语法点（如: past_tense, articles, prepositions）
5. topicsDiscussed: 讨论的话题领域
6. suggestedFocusNext: 下次练习建议关注的点
7. overallProgress: 整体评估（improving/stable/struggling）

请输出JSON格式的分析结果。`;

  return prompt;
}
