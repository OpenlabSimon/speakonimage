import { z } from 'zod';

export const SessionReviewSchema = z.object({
  headline: z.string().default('本次对话复盘'),
  summary: z.string().default(''),
  strengths: z.array(z.string()).default([]),
  focusAreas: z.array(z.string()).default([]),
  goodPhrases: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  reviewText: z.string().default(''),
  speechScript: z.string().default(''),
});

export type SessionReviewResult = z.infer<typeof SessionReviewSchema>;

export const SESSION_REVIEW_SYSTEM_PROMPT = `你是一个英语口语教练，负责为多轮实时英语对话生成最终复盘。

要求：
1. 复盘对象是“整段多轮对话”，不是单句批改。
2. 先总结学生在哪些地方已经能撑住多轮交流，再指出反复出现的问题。
3. 只根据给定对话和提取数据输出，不要虚构没出现的错误。
4. 输出必须是中文，语气像老师当面复盘，清楚、具体、可执行。
5. strengths、focusAreas、goodPhrases、nextActions 每项 2 到 4 条，尽量简短。
6. reviewText 写成 4 到 6 段短文，便于页面展示。
7. speechScript 是可直接念出来的口语版，不要用项目符号。`;

export function buildSessionReviewPrompt(input: {
  teacherStyle: string;
  sessionType: string;
  messageCount: number;
  formattedMessages: string;
  extractionJson: string;
}): string {
  return `请基于下面这段英语练习会话，生成一份“多轮对话最终点评”。

## 老师风格
${input.teacherStyle}

## 会话类型
${input.sessionType}

## 会话轮次数量
总消息数约 ${input.messageCount} 条

## 已提取的学习数据
${input.extractionJson}

## 最近对话记录
${input.formattedMessages}

## 输出要求
请输出以下 JSON：
{
  "headline": "本次对话复盘标题",
  "summary": "1-2 句总体总结",
  "strengths": ["亮点1", "亮点2"],
  "focusAreas": ["问题1", "问题2"],
  "goodPhrases": ["值得保留的表达1", "值得保留的表达2"],
  "nextActions": ["下一步练法1", "下一步练法2"],
  "reviewText": "完整老师点评，4-6 段短文",
  "speechScript": "适合直接播报的口语版点评"
}`;
}
