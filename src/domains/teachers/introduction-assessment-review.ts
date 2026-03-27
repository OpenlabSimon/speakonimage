import type { IntroductionAssessment } from '@/lib/llm/prompts/assess-level';

function levelLabel(level: IntroductionAssessment['estimatedLevel']): string {
  switch (level) {
    case 'A1':
      return '入门起步';
    case 'A2':
      return '基础已建立';
    case 'B1':
      return '能比较自然地表达自己';
    case 'B2':
      return '表达已经比较成熟';
    case 'C1':
      return '表达相当自如';
    case 'C2':
      return '已经接近高阶流利表达';
    default:
      return level;
  }
}

function ratioComment(ratio: number): string {
  if (ratio >= 0.8) {
    return '这次你大部分内容都已经在主动用英文表达了。';
  }
  if (ratio >= 0.55) {
    return '这次你已经能稳定地把一大半内容放在英文里。';
  }
  if (ratio >= 0.3) {
    return '这次你已经开始把关键内容往英文上放，但还会依赖中文托底。';
  }
  return '这次你主要还是靠中文支撑表达，英文部分还偏短。';
}

function buildObservationSummary(observations: string[]): string {
  if (observations.length === 0) {
    return '我能感觉到你已经有一定表达基础，接下来重点是把句子说完整、说稳定。';
  }

  return `我注意到这几个特点：${observations.slice(0, 3).join('；')}。`;
}

function buildNextFocus(assessment: IntroductionAssessment): string {
  const { estimatedLevel, analysis } = assessment;

  if (estimatedLevel === 'A1' || estimatedLevel === 'A2') {
    return '下一步先把固定的自我介绍骨架练稳，比如名字、工作、兴趣和学习英语的原因，每句都尽量完整说出来。';
  }

  if (analysis.englishRatio < 0.5) {
    return '下一步先把你最常说的那三四句自我介绍，逐步从中英混合改成更完整的英文。';
  }

  if (analysis.grammarLevel < estimatedLevel) {
    return '下一步重点不是再堆内容，而是把句子时态、主谓和连接方式说得更稳。';
  }

  return '下一步就继续在完整度和自然度上升级，把自我介绍说得更具体、更像真实聊天。';
}

export function buildIntroductionCoachReview(assessment: IntroductionAssessment): {
  reviewText: string;
  speechScript: string;
} {
  const confidence = Math.round(assessment.confidence * 100);
  const reviewText = [
    `先说结论，你现在放在 ${assessment.estimatedLevel} 会比较合适，说明你已经 ${levelLabel(assessment.estimatedLevel)}。`,
    `${ratioComment(assessment.analysis.englishRatio)} 词汇大致在 ${assessment.analysis.vocabularyLevel}，语法大致在 ${assessment.analysis.grammarLevel}。`,
    buildObservationSummary(assessment.analysis.observations),
    `这次判断的把握大约是 ${confidence}% ，所以接下来最有价值的不是反复看等级，而是立刻顺着这段自我介绍继续优化。`,
    buildNextFocus(assessment),
  ].join('\n\n');

  const speechScript = [
    `先说结论，你现在放在 ${assessment.estimatedLevel} 会比较合适，说明你已经 ${levelLabel(assessment.estimatedLevel)}。`,
    ratioComment(assessment.analysis.englishRatio),
    `词汇大致在 ${assessment.analysis.vocabularyLevel}，语法大致在 ${assessment.analysis.grammarLevel}。`,
    buildObservationSummary(assessment.analysis.observations),
    `我对这次判断的把握大约是 ${confidence}% 。`,
    `下一步你就顺着这段自我介绍继续优化，不要停在看等级这里。`,
    buildNextFocus(assessment),
  ].join(' ');

  return { reviewText, speechScript };
}
