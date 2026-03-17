import type { EvaluationOutput } from '@/lib/evaluation/evaluators/types';
import type { SkillDomain } from '@/types';
import type { TeacherSelection, TeacherSoulId } from './types';

interface ReviewTextInput {
  teacher: TeacherSelection;
  evaluation: EvaluationOutput;
  overallScore: number;
  skillDomain: SkillDomain;
  userResponse: string;
}

export interface ReviewTextOutput {
  reviewText: string;
  ttsText: string;
}

const SOUL_OPENERS: Record<TeacherSoulId, { high: string; mid: string; low: string }> = {
  default: {
    high: '这次整体表现很稳，表达已经比较自然了。',
    mid: '这次意思基本到了，我们重点修两三个地方就能明显更顺。',
    low: '先别急，这次最重要的是你已经完成了一次有效练习。',
  },
  gentle: {
    high: '你这次真的说得很好，我能看出来你越来越有自信了。',
    mid: '你已经表达出核心意思了，我们轻轻调整一下就会更自然。',
    low: '没关系，这一轮先把想说的意思说出来就很值得肯定了。',
  },
  strict: {
    high: '这次完成度不错，说明你已经具备稳定输出的基础。',
    mid: '核心意思到了，但语言控制还不够精确，需要继续打磨。',
    low: '这轮暴露了明显短板，但问题清楚反而是好事，接下来可以有针对性地改。',
  },
  humorous: {
    high: '这一轮不错，连我都快找不到槽点了。',
    mid: '意思送到了，不过句子还有点像穿反的外套，整理一下会顺很多。',
    low: '这次句子有点跌跌撞撞，不过好消息是它已经成功跑到终点线了。',
  },
  scholarly: {
    high: '这次输出体现了较好的语言组织能力和表达控制。',
    mid: '你的表达基础是成立的，但在准确度和自然度上还有提升空间。',
    low: '这轮结果说明当前能力边界比较清楚，适合回到更可控的表达范围继续训练。',
  },
  energetic: {
    high: '很好，这轮输出是有力量的，继续保持这个节奏。',
    mid: '可以，这轮已经打到点上了，再修几个细节就能升级。',
    low: '先稳住，这轮不是失败，是训练强度上来了。',
  },
};

function pickOpening(soulId: TeacherSoulId, overallScore: number): string {
  const soul = SOUL_OPENERS[soulId];
  if (overallScore >= 80) return soul.high;
  if (overallScore >= 50) return soul.mid;
  return soul.low;
}

function buildStrengthLine(evaluation: EvaluationOutput): string {
  if (evaluation.type === 'translation') {
    return evaluation.semanticAccuracy.comment || '你的核心意思传达是这次的主要亮点。';
  }

  return evaluation.relevance.comment || '你对题目的回应方向是对的。';
}

function buildFocusLine(evaluation: EvaluationOutput, skillDomain: SkillDomain): string {
  if (evaluation.type === 'translation') {
    const grammarIssue = evaluation.grammar.errors[0]?.rule;
    const vocabIssue = evaluation.vocabulary.improvements[0];

    if (grammarIssue) {
      return `这轮先优先修正 ${grammarIssue} 这一类问题，改好之后整句会更稳。`;
    }

    if (vocabIssue) {
      return `下一步先把用词升级一下，特别是 ${vocabIssue} 这一点。`;
    }

    return '下一步重点是把表达再说得更自然一点，而不是只求意思对。';
  }

  const grammarIssue = evaluation.languageQuality.grammarErrors[0]?.rule;

  if (skillDomain === 'spoken_expression') {
    if (grammarIssue) {
      return `口语表达里先别追求复杂，先把 ${grammarIssue} 这种基础控制住。`;
    }

    return '口语这一类训练里，下一步重点是把内容说完整，同时保持自然和连贯。';
  }

  if (grammarIssue) {
    return `书面表达里先把 ${grammarIssue} 这类错误压下去，整体质量会立刻提升。`;
  }

  return '接下来重点是把内容展开得更充分，而不只是给出简短回答。';
}

function buildNextStepLine(evaluation: EvaluationOutput, skillDomain: SkillDomain): string {
  const immediate = evaluation.suggestions?.immediate;
  if (immediate) {
    return `现在最值得马上再练一次的是：${immediate}`;
  }

  if (skillDomain === 'translation') {
    return '建议你立刻用同一个中文意思再换一种更自然的英文说法。';
  }

  if (skillDomain === 'spoken_expression') {
    return '建议你立刻再说一遍，但把句子放慢一点，优先保证完整表达。';
  }

  return '建议你立刻再写一版，把内容展开到两到三句完整表达。';
}

export function buildReviewText(input: ReviewTextInput): string {
  const opening = pickOpening(input.teacher.soulId, input.overallScore);
  const strength = buildStrengthLine(input.evaluation);
  const focus = buildFocusLine(input.evaluation, input.skillDomain);
  const nextStep = buildNextStepLine(input.evaluation, input.skillDomain);

  return [
    opening,
    `这次得分是 ${input.overallScore}/100。${strength}`,
    focus,
    nextStep,
  ].join('\n\n');
}

function shortenForSpeech(text: string): string {
  return text
    .replace(/\n+/g, ' ')
    .replace(/：/g, '，')
    .replace(/；/g, '，')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildReviewTextOutput(input: ReviewTextInput): ReviewTextOutput {
  const reviewText = buildReviewText(input);

  const opening = pickOpening(input.teacher.soulId, input.overallScore);
  const focus = buildFocusLine(input.evaluation, input.skillDomain);
  const nextStep = buildNextStepLine(input.evaluation, input.skillDomain);

  const ttsText = shortenForSpeech(
    [
      opening,
      `这次得分 ${input.overallScore} 分。`,
      focus,
      nextStep,
    ].join(' ')
  );

  return {
    reviewText,
    ttsText,
  };
}
