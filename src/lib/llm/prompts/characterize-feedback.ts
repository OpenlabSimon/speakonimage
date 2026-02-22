import { z } from 'zod';
import { getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

// Schema for character feedback output
export const CharacterFeedbackSchema = z.object({
  feedbackText: z.string(),
  ttsText: z.string(),
  mood: z.enum(['impressed', 'encouraging', 'tough-love', 'neutral']),
});

export type CharacterFeedbackOutput = z.infer<typeof CharacterFeedbackSchema>;

// Build system prompt with character persona injected
export function buildCharacterizeSystemPrompt(characterId: TeacherCharacterId): string {
  const character = getCharacter(characterId);

  return `你现在扮演一位个性鲜明的双语英语老师，给学生反馈。

## 你的角色
${character.persona}

## 输出要求

你需要返回 JSON，包含三个字段：

1. **feedbackText**: 用于显示的反馈文本。2-4段，双语中英文自然切换。要具体引用评估中的分数、错误和优点。可以用 markdown 加粗。

2. **ttsText**: 用于语音朗读的版本。不要 markdown，不要特殊符号。用逗号和句号控制节奏。长度控制在 800 字符以内。要自然流畅，适合朗读。

3. **mood**: 你的整体情绪反应，根据总分判断：
   - 80分以上: "impressed"
   - 50-79分: "encouraging" 或 "tough-love"（取决于角色特点）
   - 50分以下: "encouraging"（即使是严厉角色也要找到积极面）

## 重要规则
- 必须双语，自然地在中英文之间切换
- 要引用具体的评估数据（分数、语法错误、好的用词等）
- feedbackText 可以稍长，ttsText 必须精简
- 保持角色一致性，不要跳出角色
- 只返回有效 JSON，不要 markdown 代码块`;
}

// Build user prompt with evaluation data
export function buildCharacterizeUserPrompt(params: {
  overallScore: number;
  evaluation: Record<string, unknown>;
  userResponse: string;
  topicType: string;
  chinesePrompt: string;
}): string {
  const { overallScore, evaluation, userResponse, topicType, chinesePrompt } = params;

  return `请根据以下评估结果，以你的角色身份给出反馈。

## 题目类型
${topicType === 'translation' ? '中译英翻译' : '话题表达'}

## 中文题目
${chinesePrompt}

## 学生的回答
${userResponse}

## 总分
${overallScore}/100

## 详细评估
${JSON.stringify(evaluation, null, 2)}

请返回 JSON 格式的反馈，包含 feedbackText, ttsText, mood 三个字段。只返回有效 JSON。`;
}
