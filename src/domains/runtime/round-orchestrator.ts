import { evaluateResponse, getProfileContext, persistSubmission } from '@/lib/evaluation/evaluateSubmission';
import type { EvaluationOutput } from '@/lib/evaluation/evaluators/types';
import type { InputMethod, TopicType } from '@/types';
import {
  normalizeReviewPreference,
  normalizeTeacherSelection,
} from '@/domains/teachers/defaults';
import type {
  AudioReview,
  HtmlArtifact,
  ReviewPreference,
  TeacherSelection,
} from '@/domains/teachers/types';
import { buildReviewTextOutput } from '@/domains/teachers/review-text';
import { buildAudioReview } from '@/domains/teachers/review-audio-generator';
import { buildHtmlArtifact } from '@/domains/teachers/review-html-generator';

export interface RoundTopicContent {
  chinesePrompt: string;
  keyPoints?: string[];
  guidingQuestions?: string[];
  suggestedVocab: Array<{
    word: string;
    phonetic: string;
    partOfSpeech: string;
    chinese: string;
    exampleContext: string;
  }>;
  grammarHints?: Array<{
    point: string;
    explanation: string;
    pattern: string;
    example: string;
  }>;
}

export interface AuthenticatedRoundContext {
  authenticated: true;
  userId: string;
}

export interface AnonymousRoundContext {
  authenticated: false;
}

export type RoundAuthContext = AuthenticatedRoundContext | AnonymousRoundContext;

export interface RunCoachingRoundInput {
  auth: RoundAuthContext;
  topicType: TopicType;
  topicContent: RoundTopicContent;
  userResponse: string;
  inputMethod: InputMethod;
  teacher?: Partial<TeacherSelection>;
  review?: Partial<ReviewPreference>;
  historyAttempts?: Array<{
    text: string;
    score: number;
  }>;
  persistence?: {
    topicId?: string;
    sessionId?: string;
    audioUrl?: string;
  };
}

export interface RunCoachingRoundResult {
  submissionId?: string;
  sessionId?: string;
  evaluation: EvaluationOutput;
  overallScore: number;
  inputMethod: InputMethod;
  practiceMode: 'translation_text' | 'translation_voice' | 'expression_text' | 'expression_voice';
  skillDomain: 'translation' | 'written_expression' | 'spoken_expression';
  teacher: TeacherSelection;
  review: ReviewPreference;
  reviewText: string;
  ttsText: string;
  audioReview: AudioReview;
  htmlArtifact: HtmlArtifact;
}

/**
 * Orchestrates one full coaching round:
 * evaluate the response, optionally persist the attempt, and return a stable
 * result payload that future coach runtimes can enrich with artifact outputs.
 */
export async function runCoachingRound(
  input: RunCoachingRoundInput
): Promise<RunCoachingRoundResult> {
  const teacher = normalizeTeacherSelection(input.teacher);
  const review = normalizeReviewPreference(input.review);
  const profileContext = input.auth.authenticated
    ? await getProfileContext(input.auth.userId)
    : null;

  const { evaluation, overallScore, practiceMode, skillDomain } = await evaluateResponse({
    topicType: input.topicType,
    chinesePrompt: input.topicContent.chinesePrompt,
    keyPoints: input.topicContent.keyPoints,
    guidingQuestions: input.topicContent.guidingQuestions,
    suggestedVocab: input.topicContent.suggestedVocab,
    grammarHints: input.topicContent.grammarHints,
    userResponse: input.userResponse,
    inputMethod: input.inputMethod,
    historyAttempts: input.historyAttempts,
    profileContext,
  });

  let submissionId: string | undefined;
  let sessionId = input.persistence?.sessionId;

  if (input.auth.authenticated && input.persistence?.topicId) {
    const persisted = await persistSubmission({
      topicId: input.persistence.topicId,
      accountId: input.auth.userId,
      inputMethod: input.inputMethod,
      userResponse: input.userResponse,
      audioUrl: input.persistence.audioUrl,
      evaluation,
      overallScore,
      topicType: input.topicType,
      suggestedVocab: input.topicContent.suggestedVocab,
      sessionId,
    });

    submissionId = persisted.submissionId;
    sessionId = persisted.sessionId;
  }

  const { reviewText, ttsText } = buildReviewTextOutput({
    teacher,
    evaluation,
    overallScore,
    skillDomain,
    userResponse: input.userResponse,
  });
  const audioReview = await buildAudioReview({
    teacher,
    review,
    ttsText,
  });
  const htmlArtifact = buildHtmlArtifact({
    teacher,
    review,
    evaluation,
    overallScore,
    reviewText,
    userResponse: input.userResponse,
    skillDomain,
  });

  return {
    submissionId,
    sessionId,
    evaluation,
    overallScore,
    inputMethod: input.inputMethod,
    practiceMode,
    skillDomain,
    teacher,
    review,
    reviewText,
    ttsText,
    audioReview,
    htmlArtifact,
  };
}
