import { getLLMProvider } from '@/lib/llm';
import { resolveFastLLMModel } from '@/lib/llm/model-selection';
import {
  buildSessionReviewPrompt,
  SessionReviewSchema,
  SESSION_REVIEW_SYSTEM_PROMPT,
  type SessionReviewResult,
} from '@/lib/llm/prompts/session-review';
import type { ChatMessage, ChatSession, SessionExtractionResult } from '@/lib/memory/types';
import type { TeacherSelection } from './types';

export interface SessionReviewOutput extends SessionReviewResult {
  generatedAt: string;
  sourceMessageCount: number;
}

export async function buildSessionReview(input: {
  teacher: TeacherSelection;
  session: ChatSession;
  messages: ChatMessage[];
  extraction: SessionExtractionResult;
}): Promise<SessionReviewOutput> {
  const formattedMessages = formatMessagesForPrompt(input.messages);
  const extractionJson = JSON.stringify(
    {
      sessionSummary: input.extraction.sessionSummary,
      overallProgress: input.extraction.overallProgress,
      grammarPointsTouched: input.extraction.grammarPointsTouched,
      topicsDiscussed: input.extraction.topicsDiscussed,
      suggestedFocusNext: input.extraction.suggestedFocusNext,
      errors: input.extraction.errors.slice(0, 4),
      newVocabulary: input.extraction.newVocabulary.slice(0, 6),
    },
    null,
    2
  );

  const prompt = buildSessionReviewPrompt({
    teacherStyle: describeTeacherStyle(input.teacher),
    sessionType: input.session.sessionType,
    messageCount: input.messages.length,
    formattedMessages,
    extractionJson,
  });

  try {
    const llm = getLLMProvider('critical');
    const result = await llm.generateJSON(
      prompt,
      SessionReviewSchema,
      SESSION_REVIEW_SYSTEM_PROMPT,
      { model: resolveFastLLMModel() }
    );

    return {
      ...result,
      generatedAt: new Date().toISOString(),
      sourceMessageCount: input.messages.length,
    };
  } catch (error) {
    console.error('Session review generation failed, falling back to deterministic review:', error);
    return buildFallbackSessionReview(input);
  }
}

function formatMessagesForPrompt(messages: ChatMessage[]): string {
  const recentMessages = messages.slice(-16);

  return recentMessages
    .map((message) => {
      const roleLabel = message.role === 'user'
        ? 'Student'
        : message.role === 'assistant'
          ? 'Teacher'
          : 'System';
      return `${roleLabel}: ${message.content}`;
    })
    .join('\n\n');
}

function describeTeacherStyle(teacher: TeacherSelection): string {
  switch (teacher.soulId) {
    case 'gentle':
      return '语气温柔、鼓励感强，但不要空泛安慰。';
    case 'strict':
      return '语气直接、标准明确，但不要羞辱学生。';
    case 'humorous':
      return '可以轻微幽默，但不能抢走复盘重点。';
    case 'scholarly':
      return '语气理性、条理清楚，像认真负责的语言老师。';
    case 'energetic':
      return '语气有推进感，像教练在带节奏。';
    default:
      return '语气自然、专业，像靠谱的英语老师。';
  }
}

function buildFallbackSessionReview(input: {
  teacher: TeacherSelection;
  session: ChatSession;
  messages: ChatMessage[];
  extraction: SessionExtractionResult;
}): SessionReviewOutput {
  const userTurnCount = input.messages.filter((message) => message.role === 'user').length;
  const strengths = [
    userTurnCount >= 3 ? `你已经完成了 ${userTurnCount} 轮以上的连续表达。` : '你已经完成了一次有效的连续对话练习。',
    input.extraction.sessionSummary || '这轮对话里，你基本能围绕同一主题继续往下说。',
    input.extraction.newVocabulary[0]
      ? `你已经开始主动使用 ${input.extraction.newVocabulary[0].word} 这类表达。`
      : '你已经能把核心意思先表达出来了。',
  ].filter(Boolean).slice(0, 3);

  const focusAreas = [
    ...input.extraction.errors.slice(0, 2).map((error) => error.pattern || error.type || '句子准确度'),
    ...input.extraction.suggestedFocusNext.slice(0, 2),
  ].filter(Boolean).slice(0, 4);

  const goodPhrases = input.extraction.newVocabulary
    .map((item) => item.word)
    .filter(Boolean)
    .slice(0, 4);

  const nextActions = input.extraction.suggestedFocusNext.length > 0
    ? input.extraction.suggestedFocusNext.slice(0, 4)
    : ['下一轮继续围绕同一话题说，但每次尽量多说一句完整句。'];

  const reviewText = [
    buildFallbackOpening(input.teacher, input.extraction.overallProgress),
    input.extraction.sessionSummary || '这次你已经完成了多轮来回，不再只是单句作答。',
    strengths.length > 0 ? `先说亮点：${strengths.join(' ')}` : null,
    focusAreas.length > 0 ? `接下来最该盯住的是：${focusAreas.join('；')}。` : null,
    `下一步建议你这样练：${nextActions.join('；')}。`,
  ].filter(Boolean).join('\n\n');

  return {
    headline: '本次对话复盘',
    summary: input.extraction.sessionSummary || '这次你已经完成了一段可复盘的多轮对话。',
    strengths,
    focusAreas,
    goodPhrases,
    nextActions,
    reviewText,
    speechScript: reviewText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim(),
    generatedAt: new Date().toISOString(),
    sourceMessageCount: input.messages.length,
  };
}

function buildFallbackOpening(
  teacher: TeacherSelection,
  overallProgress: SessionExtractionResult['overallProgress']
): string {
  if (overallProgress === 'improving') {
    return teacher.soulId === 'strict'
      ? '这轮比前面更稳，说明你不是碰巧答对，而是在形成能力。'
      : '这轮能感觉到你在变稳，不是只会说一两句了。';
  }

  if (overallProgress === 'struggling') {
    return teacher.soulId === 'gentle'
      ? '这轮有卡顿很正常，但你已经把问题暴露出来了，这正是复盘的价值。'
      : '这轮暴露出几个反复回摆的点，但问题清楚了就能对着修。';
  }

  return '这轮整体是稳中有起伏，但已经具备做一份完整复盘的价值。';
}
