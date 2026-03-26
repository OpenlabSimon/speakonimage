import { z } from 'zod';

export const RecommendationItemSchema = z.object({
  title: z.string(),
  detail: z.string(),
  reason: z.string(),
});

export const ProfileRecommendationSchema = z.object({
  topics: z.array(RecommendationItemSchema).min(1).max(3),
  vocabulary: z.array(RecommendationItemSchema).min(1).max(3),
  examples: z.array(RecommendationItemSchema).min(1).max(3),
});

export type ProfileRecommendationOutput = z.infer<typeof ProfileRecommendationSchema>;

export const PROFILE_RECOMMENDATION_SYSTEM_PROMPT = `你是一位非常懂用户兴趣的英语老师兼学习策划。

你的任务不是重新发明推荐方向，而是在给定的候选方向上，把推荐改写得更自然、更像真人老师会说的话。

要求：
1. 必须围绕输入中给定的用户兴趣、薄弱点、候选主题和候选词汇展开，不要偏题。
2. 输出要具体、自然、可执行，像老师在给一个真实学生布置下一轮练习。
3. vocabulary 项的 title 必须是一个英文单词或短语。
4. examples 项的 detail 必须是一句可直接模仿或改写的英文例句。
5. 不要输出空泛鼓励，不要只重复原文。
6. 只返回符合 schema 的 JSON。`;

export function buildProfileRecommendationPrompt(input: {
  interests: string[];
  goals: string[];
  weakWords: string[];
  recentVocabulary: string[];
  candidateTopics: string[];
  candidateVocabulary: string[];
  candidateExamples: string[];
}) {
  return `请基于以下用户画像和规则筛选出的候选项，生成更自然的推荐。

## 用户兴趣
${input.interests.join('、') || '暂无'}

## 当前重点
${input.goals.join('；') || '暂无'}

## 薄弱词汇
${input.weakWords.join(', ') || '暂无'}

## 最近词汇
${input.recentVocabulary.join(', ') || '暂无'}

## 候选话题
${input.candidateTopics.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}

## 候选词汇
${input.candidateVocabulary.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}

## 候选例句
${input.candidateExamples.map((item, index) => `${index + 1}. ${item}`).join('\n') || '暂无'}

请输出 JSON：
{
  "topics": [{"title": "...", "detail": "...", "reason": "..."}],
  "vocabulary": [{"title": "...", "detail": "...", "reason": "..."}],
  "examples": [{"title": "...", "detail": "...", "reason": "..."}]
}`;
}
