import {
  evaluateResponse,
  getProfileContext,
  getSpeakerLanguageProfile,
  persistSubmission,
} from '@/lib/evaluation/evaluateSubmission';
import { compareCefrLevels, normalizeCefrLevel } from '@/lib/cefr';
import type { EvaluationOutput } from '@/lib/evaluation/evaluators/types';
import type { CEFRLevel, InputMethod, TopicType } from '@/types';
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
import { buildAudioReview, buildPendingAudioReview } from '@/domains/teachers/review-audio-generator';
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
  difficultyMetadata?: {
    targetCefr: string;
    vocabComplexity?: number;
    grammarComplexity?: number;
  };
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
  deferAudioReview?: boolean;
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
  speechScript: string;
  /** @deprecated Use speechScript instead. */
  ttsText: string;
  audioReview: AudioReview;
  htmlArtifact: HtmlArtifact;
  sameTopicProgress?: SameTopicProgress | null;
  difficultySignal?: DifficultySignal | null;
}

export interface SameTopicProgress {
  attemptCount: number;
  deltaFromLast: number;
  isBestSoFar: boolean;
  trend: 'up' | 'flat' | 'down';
}

export interface DifficultySignal {
  targetCefr: CEFRLevel;
  baselineCefr: CEFRLevel;
  relation: 'stretch' | 'matched' | 'easier';
}

function buildSameTopicProgress(
  historyAttempts: RunCoachingRoundInput['historyAttempts'],
  overallScore: number
): SameTopicProgress | null {
  if (!historyAttempts || historyAttempts.length === 0) {
    return null;
  }

  const previousScores = historyAttempts.map((item) => item.score);
  const lastScore = previousScores[previousScores.length - 1] ?? overallScore;

  return {
    attemptCount: historyAttempts.length + 1,
    deltaFromLast: overallScore - lastScore,
    isBestSoFar: overallScore >= Math.max(...previousScores),
    trend: overallScore > lastScore ? 'up' : overallScore < lastScore ? 'down' : 'flat',
  };
}

function buildDifficultySignal(
  languageProfile: Awaited<ReturnType<typeof getSpeakerLanguageProfile>>,
  topicContent: RoundTopicContent
): DifficultySignal | null {
  if (!topicContent.difficultyMetadata?.targetCefr) {
    return null;
  }

  const targetCefr = normalizeCefrLevel(topicContent.difficultyMetadata.targetCefr);
  const baselineCefr = normalizeCefrLevel(languageProfile?.estimatedCefr, targetCefr);
  const diff = compareCefrLevels(targetCefr, baselineCefr);

  if (diff > 0) {
    return { targetCefr, baselineCefr, relation: 'stretch' };
  }
  if (diff < 0) {
    return { targetCefr, baselineCefr, relation: 'easier' };
  }

  return { targetCefr, baselineCefr, relation: 'matched' };
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
  const [profileContext, languageProfile] = input.auth.authenticated
    ? await Promise.all([
        getProfileContext(input.auth.userId),
        getSpeakerLanguageProfile(input.auth.userId),
      ])
    : [null, null];

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
  const sameTopicProgress = buildSameTopicProgress(input.historyAttempts, overallScore);
  const difficultySignal = buildDifficultySignal(languageProfile, input.topicContent);

  const { reviewText, speechScript, ttsText } = buildReviewTextOutput({
    teacher,
    evaluation,
    overallScore,
    skillDomain,
    inputMethod: input.inputMethod,
    userResponse: input.userResponse,
    languageProfile,
    sameTopicProgress,
    difficultySignal,
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
      coachReviewText: reviewText,
      speechScript,
      ttsText,
    });

    submissionId = persisted.submissionId;
    sessionId = persisted.sessionId;
  }
  const audioReview = input.deferAudioReview
    ? buildPendingAudioReview({
        teacher,
        review,
        speechScript,
        sessionId,
      })
    : await buildAudioReview({
        teacher,
        review,
        speechScript,
        sessionId,
      });
  const htmlArtifact = buildHtmlArtifact({
    teacher,
    review,
    evaluation,
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
    speechScript,
    ttsText,
    audioReview,
    htmlArtifact,
    sameTopicProgress,
    difficultySignal,
  };
}
