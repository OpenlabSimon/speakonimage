import type { EvaluationOutput } from '@/lib/evaluation/evaluators/types';
import type { LanguageProfile, SkillDomain } from '@/types';
import type { TeacherSelection, TeacherSoulId } from './types';
import type { InputMethod } from '@/types';

interface ReviewTextInput {
  teacher: TeacherSelection;
  evaluation: EvaluationOutput;
  overallScore: number;
  skillDomain: SkillDomain;
  inputMethod: InputMethod;
  userResponse: string;
  languageProfile?: LanguageProfile | null;
  sameTopicProgress?: {
    attemptCount: number;
    deltaFromLast: number;
    isBestSoFar: boolean;
    trend: 'up' | 'flat' | 'down';
  } | null;
  difficultySignal?: {
    targetCefr: string;
    baselineCefr: string;
    relation: 'stretch' | 'matched' | 'easier';
  } | null;
}

export interface ReviewTextOutput {
  reviewText: string;
  speechScript: string;
  /** @deprecated Use speechScript instead. */
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

const SOUL_SPEECH_STYLE: Record<
  TeacherSoulId,
  {
    praisePrefix: string;
    progressLead: string;
    reminderLead: string;
    correctionLead: string;
    nextStepLead: string;
    closing: string;
  }
> = {
  default: {
    praisePrefix: '先说亮点，',
    progressLead: '放回到同一个练习脉络里看，',
    reminderLead: '再补一句你要长期记住的，',
    correctionLead: '回到这一轮，',
    nextStepLead: '下一次你先这样练，',
    closing: '继续保持这个节奏，我们就能把它练稳。',
  },
  gentle: {
    praisePrefix: '我先抱抱你这次做对的部分，',
    progressLead: '如果和刚才那一版比，',
    reminderLead: '还有一个要温柔地反复提醒你的地方，',
    correctionLead: '回到这一轮，我只抓一个最关键的小地方，',
    nextStepLead: '你下一次先这样试试看，',
    closing: '不用急，你已经在往前走了。',
  },
  strict: {
    praisePrefix: '先确认有效部分，',
    progressLead: '按同题连续提交来看，',
    reminderLead: '有一个长期问题你还要继续盯住，',
    correctionLead: '回到本轮，核心修正只有一个，',
    nextStepLead: '下一轮按这个要求直接重做，',
    closing: '把这一点压稳，整体质量就会上来。',
  },
  humorous: {
    praisePrefix: '先夸一句，免得我一开口你就想逃，',
    progressLead: '如果把这两版放一起看，',
    reminderLead: '顺手提醒一个老朋友级别的问题，',
    correctionLead: '拉回这一轮，真正要修的点是，',
    nextStepLead: '下一轮你先这么来，',
    closing: '再练一轮，这句子就不会继续绊自己了。',
  },
  scholarly: {
    praisePrefix: '先看成立的部分，',
    progressLead: '若按同题轨迹观察，',
    reminderLead: '还有一个需要持续监控的长期点，',
    correctionLead: '聚焦本轮，优先修正的是，',
    nextStepLead: '下一步建议你这样操作，',
    closing: '把这个环节稳定下来，表达质量会更完整。',
  },
  energetic: {
    praisePrefix: '先说最提气的一点，',
    progressLead: '如果跟上一版放在一起看，',
    reminderLead: '还有一个老毛病我得继续盯着你，',
    correctionLead: '回到这一轮，先狠狠干掉这个问题，',
    nextStepLead: '下一轮你就照这个方向冲，',
    closing: '继续推，这一题你真的快拿下了。',
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

function buildLongTermReminderLine(languageProfile?: LanguageProfile | null): string | null {
  const reminders = languageProfile?.coachMemory?.longTermReminders || [];
  if (reminders.length === 0) return null;
  return `先复盘长期提醒：${reminders[0].text}`;
}

function buildRoundReminderLine(
  languageProfile: LanguageProfile | null | undefined,
  fallbackFocusLine: string
): string {
  const reminders = languageProfile?.coachMemory?.currentRoundReminders || [];
  if (reminders.length === 0) {
    return fallbackFocusLine;
  }

  return `回到这一轮，最关键的修正是：${reminders[0].text}`;
}

function buildSameTopicProgressLine(input: ReviewTextInput): string | null {
  if (!input.sameTopicProgress) return null;

  const { trend, attemptCount, isBestSoFar } = input.sameTopicProgress;
  if (attemptCount < 2) return null;

  if (trend === 'up') {
    const suffix = isBestSoFar ? '而且这是这个话题里你目前最稳的一版。' : '说明你确实在同题修正。';
    return `同一个话题里，你这次比上一版更稳了，${suffix}`;
  }

  if (trend === 'down' && input.difficultySignal?.relation === 'stretch') {
    return '虽然这次没有上一版那么稳，但这轮你是在更高难度上继续挑战，不算退步。';
  }

  if (trend === 'down') {
    return '同一个话题里，这次比上一版有一点回摆，说明还有一个关键点没有稳住。';
  }

  return '同一个话题里，这次和上一版状态接近，接下来要追求的是更稳定、更自然。';
}

function buildDifficultyLine(input: ReviewTextInput): string | null {
  if (!input.difficultySignal) return null;

  if (input.difficultySignal.relation === 'stretch') {
    return `这次目标难度是 ${input.difficultySignal.targetCefr}，比你当前稳定水平 ${input.difficultySignal.baselineCefr} 更高，所以出现一点波动是正常的。`;
  }

  if (input.difficultySignal.relation === 'easier') {
    return `这次你把练习先收回到 ${input.difficultySignal.targetCefr}，这是在回炉打基础，不是退步。`;
  }

  return null;
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

function buildRecommendationTransitionLine(
  languageProfile: LanguageProfile | null | undefined,
  spoken = false
): string | null {
  const topTopic = languageProfile?.recommendations?.topics?.[0];
  if (topTopic) {
    return spoken
      ? `你下一题就直接练这个，${topTopic.title}。${topTopic.detail}`
      : `下一题建议直接练：${topTopic.title}。${topTopic.detail}`;
  }

  const nextFocus = languageProfile?.recommendations?.nextFocus?.[0];
  if (nextFocus) {
    return spoken
      ? `你下一轮就围绕这个继续练，重点盯住 ${nextFocus}。`
      : `下一题建议继续围绕 ${nextFocus} 来练。`;
  }

  return null;
}

function buildSpeechProgressLine(input: ReviewTextInput): string | null {
  if (!input.sameTopicProgress || input.sameTopicProgress.attemptCount < 2) {
    return null;
  }

  const { trend } = input.sameTopicProgress;
  if (trend === 'up') {
    return '同一个话题里，这次比上一版更稳，说明你真的在吸收刚才的提醒。';
  }

  if (trend === 'down' && input.difficultySignal?.relation === 'stretch') {
    return '这轮你是在更高难度上继续挑战，有一点波动很正常，不算退步。';
  }

  if (trend === 'down') {
    return '这一版还有个关键点没完全站稳，但方向还是对的。';
  }

  return '这一版和上一版很接近，接下来要追求的是更稳定、更自然。';
}

function buildSpeechDifficultyLine(input: ReviewTextInput): string | null {
  if (!input.difficultySignal) return null;

  if (input.difficultySignal.relation === 'stretch') {
    return `这次题目的难度比你当前稳定水平更高一点，所以先把核心表达说稳就很好。`;
  }

  if (input.difficultySignal.relation === 'easier') {
    return `这轮先回到更可控的难度，把基础重新站稳，这个选择是对的。`;
  }

  return null;
}

function buildTopicTypeSpeechLead(input: ReviewTextInput): string {
  if (input.evaluation.type === 'translation') {
    return '这是一道翻译题，所以我会更盯你的准确度、纠错点和更自然的替换说法。';
  }

  if (input.skillDomain === 'spoken_expression') {
    return '这是一道表达题，我会更看你怎么把想法说展开、说连贯、说得像真实交流。';
  }

  return '这是一道表达题，我会更看你怎么把内容组织清楚、展开完整、写得更自然。';
}

function buildTopicTypeSpeechFocus(input: ReviewTextInput): string {
  if (input.evaluation.type === 'translation') {
    return '下一轮别急着堆复杂句，先把关键词、时态和固定表达改准，再追求更地道。';
  }

  if (input.skillDomain === 'spoken_expression') {
    return '下一轮先把观点撑开一点，至少多给一个细节，让口语内容更有层次。';
  }

  return '下一轮先把内容撑开一点，至少多写一个细节或原因，让表达更完整。';
}

function getRelevantUsageSnapshot(languageProfile?: LanguageProfile | null) {
  const snapshots = languageProfile?.usageProfile?.snapshots || [];
  return (
    snapshots.find((item) => item.key === 'latest_attempt' && item.sampleCount > 0) ||
    snapshots.find((item) => item.key === 'rolling_30m' && item.sampleCount > 0) ||
    snapshots.find((item) => item.sampleCount > 0) ||
    null
  );
}

function buildProfileStrengthSpeechLine(input: ReviewTextInput): string | null {
  const snapshot = getRelevantUsageSnapshot(input.languageProfile);
  if (!snapshot) return null;

  if (snapshot.strengths[0]) {
    return `从你最近的输出习惯看，${snapshot.strengths[0]}，这是你可以继续放大的优势。`;
  }

  if (snapshot.preferredVocabulary[0]) {
    return `你最近愿意主动把 ${snapshot.preferredVocabulary.slice(0, 2).join('、')} 这类词拿出来用，这是很好的信号。`;
  }

  return null;
}

function buildProfileGuardrailSpeechLine(input: ReviewTextInput): string | null {
  const snapshot = getRelevantUsageSnapshot(input.languageProfile);
  if (snapshot?.weaknesses[0]) {
    return `但你现在还是要先避开一个坑，${snapshot.weaknesses[0]}。`;
  }

  if (snapshot?.avoidVocabulary[0]) {
    return `但你现在先别硬顶这些还不稳的词，比如 ${snapshot.avoidVocabulary.slice(0, 2).join('、')}。`;
  }

  if (snapshot?.avoidGrammarPatterns[0]) {
    return `但你现在最该继续压下去的，还是 ${snapshot.avoidGrammarPatterns.slice(0, 2).join('、')} 这一类问题。`;
  }

  const persistentError = input.languageProfile?.grammarProfile?.persistentErrors?.[0];
  if (persistentError?.pattern) {
    return `但从长期画像看，${persistentError.pattern} 还是你要持续盯住的问题。`;
  }

  return null;
}

function buildSpeechScript(input: ReviewTextInput): string {
  const style = SOUL_SPEECH_STYLE[input.teacher.soulId];
  const opening = pickOpening(input.teacher.soulId, input.overallScore);
  const strength = buildStrengthLine(input.evaluation);
  const focus = buildFocusLine(input.evaluation, input.skillDomain);
  const longTermReminder = buildLongTermReminderLine(input.languageProfile);
  const roundReminder = buildRoundReminderLine(input.languageProfile, focus);
  const progressLine = buildSpeechProgressLine(input);
  const difficultyLine = buildSpeechDifficultyLine(input);
  const nextStep = buildNextStepLine(input.evaluation, input.skillDomain);
  const topicTypeLead = buildTopicTypeSpeechLead(input);
  const topicTypeFocus = buildTopicTypeSpeechFocus(input);
  const profileStrengthLine = buildProfileStrengthSpeechLine(input);
  const profileGuardrailLine = buildProfileGuardrailSpeechLine(input);
  const recommendationTransition = buildRecommendationTransitionLine(input.languageProfile, true);
  const modeOpening =
    input.inputMethod === 'voice'
      ? '这次我按你真实开口说出来的状态来带你复盘，重点看口语的稳定度和表达控制。'
      : '这次我按你写出来的版本来带你复盘，重点看句子组织、用词和语法控制。';
  const modeFocus =
    input.inputMethod === 'voice'
      ? '下一轮你优先追求开口更顺、更完整，不要一着急就把句子说散。'
      : '下一轮你优先追求句子更完整、更自然，不要只把意思写到。';

  return [
    opening,
    modeOpening,
    topicTypeLead,
    `${style.praisePrefix}${strength}`,
    profileStrengthLine,
    progressLine ? `${style.progressLead}${progressLine}` : null,
    difficultyLine,
    profileGuardrailLine,
    longTermReminder ? `${style.reminderLead}${longTermReminder.replace(/^先复盘长期提醒：/, '')}` : null,
    `${style.correctionLead}${roundReminder.replace(/^回到这一轮，/, '')}`,
    `${style.nextStepLead}${nextStep.replace(/^现在最值得马上再练一次的是：/, '').replace(/^建议你立刻/, '')}`,
    modeFocus,
    topicTypeFocus,
    recommendationTransition,
    style.closing,
  ].filter(Boolean).join('\n\n');
}

export function buildReviewText(input: ReviewTextInput): string {
  const opening = pickOpening(input.teacher.soulId, input.overallScore);
  const strength = buildStrengthLine(input.evaluation);
  const focus = buildFocusLine(input.evaluation, input.skillDomain);
  const longTermReminder = buildLongTermReminderLine(input.languageProfile);
  const roundReminder = buildRoundReminderLine(input.languageProfile, focus);
  const sameTopicProgress = buildSameTopicProgressLine(input);
  const difficultyLine = buildDifficultyLine(input);
  const nextStep = buildNextStepLine(input.evaluation, input.skillDomain);
  const recommendationTransition = buildRecommendationTransitionLine(input.languageProfile);

  return [
    opening,
    strength,
    sameTopicProgress,
    difficultyLine,
    longTermReminder,
    roundReminder,
    nextStep,
    recommendationTransition,
  ].filter(Boolean).join('\n\n');
}

function shortenForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\n+/g, ' ')
    .replace(/：/g, '，')
    .replace(/；/g, '，')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildReviewTextOutput(input: ReviewTextInput): ReviewTextOutput {
  const reviewText = buildReviewText(input);
  const speechScript = shortenForSpeech(buildSpeechScript(input));
  const ttsText = speechScript;

  return {
    reviewText,
    speechScript,
    ttsText,
  };
}
