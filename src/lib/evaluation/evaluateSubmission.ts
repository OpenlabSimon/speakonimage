import { prisma } from '@/lib/db';
import {
  getOrCreateSessionForTopic,
  addMessage,
} from '@/lib/memory/ConversationManager';
import { buildProfileContext } from '@/lib/profile/ProfileInjector';
import { evaluateTranslationAttempt } from './evaluators/evaluateTranslationAttempt';
import { evaluateWrittenExpressionAttempt } from './evaluators/evaluateWrittenExpressionAttempt';
import { evaluateSpokenExpressionAttempt } from './evaluators/evaluateSpokenExpressionAttempt';
import {
  calculateOverallScore,
  getPracticeMode,
  getSkillDomain,
} from './evaluators/types';
import type {
  EvaluationOutput,
  EvaluateParams,
  EvaluateResult,
} from './evaluators/types';

export interface PersistParams {
  topicId: string;
  accountId: string;
  speakerId?: string;
  inputMethod: 'voice' | 'text';
  userResponse: string;
  audioUrl?: string;
  evaluation: EvaluationOutput;
  overallScore: number;
  topicType: 'translation' | 'expression';
  suggestedVocab: { word: string }[];
  sessionId?: string;
  coachReviewText?: string;
  ttsText?: string;
}

export interface PersistResult {
  submissionId: string;
  sessionId?: string;
}

/**
 * Run LLM evaluation on a user's response.
 */
export async function evaluateResponse(params: EvaluateParams): Promise<EvaluateResult> {
  const practiceMode = getPracticeMode(params.topicType, params.inputMethod);
  const skillDomain = getSkillDomain(practiceMode);

  let evaluation: EvaluationOutput;

  switch (practiceMode) {
    case 'translation_text':
    case 'translation_voice':
      evaluation = await evaluateTranslationAttempt(params);
      break;
    case 'expression_text':
      evaluation = await evaluateWrittenExpressionAttempt(params);
      break;
    case 'expression_voice':
      evaluation = await evaluateSpokenExpressionAttempt(params);
      break;
  }

  const overallScore = calculateOverallScore(evaluation);
  return { evaluation, overallScore, practiceMode, skillDomain };
}

export { calculateOverallScore } from './evaluators/types';

/**
 * Build profile context for an authenticated user.
 */
export async function getProfileContext(accountId: string): Promise<string | null> {
  const speaker = await prisma.speaker.findFirst({
    where: { accountId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!speaker) return null;
  return buildProfileContext(speaker.id);
}

/**
 * Persist submission to database (submission, grammar errors, vocab, session messages).
 */
export async function persistSubmission(params: PersistParams): Promise<PersistResult> {
  const {
    topicId, accountId, speakerId, inputMethod, userResponse,
    audioUrl, evaluation, overallScore, topicType, suggestedVocab, sessionId, coachReviewText, ttsText,
  } = params;

  // Get attempt number
  const previousAttempts = await prisma.submission.count({
    where: { topicId, accountId },
  });

  // Get speaker
  const speaker = speakerId
    ? { id: speakerId }
    : await prisma.speaker.findFirst({
        where: { accountId },
        orderBy: { createdAt: 'asc' },
      });

  // Create submission
  const submission = await prisma.submission.create({
    data: {
      topicId,
      accountId,
      speakerId: speaker?.id,
      attemptNumber: previousAttempts + 1,
      inputMethod,
      rawAudioUrl: audioUrl,
      transcribedText: userResponse,
      evaluation: evaluation as object,
      difficultyAssessment: {
        overallScore,
        estimatedCefr: evaluation.overallCefrEstimate,
      },
    },
  });

  // Extract and save grammar errors
  const grammarErrors = evaluation.type === 'translation'
    ? evaluation.grammar.errors
    : evaluation.languageQuality.grammarErrors;

  if (grammarErrors && grammarErrors.length > 0) {
    await prisma.grammarError.createMany({
      data: grammarErrors.map(error => ({
        submissionId: submission.id,
        speakerId: speaker?.id,
        errorPattern: error.rule,
        originalText: error.original,
        correctedText: error.corrected,
        severity: error.severity,
      })),
    });
  }

  // Extract and save vocabulary usage
  const usedVocabWords = suggestedVocab.filter(vocab =>
    userResponse.toLowerCase().includes(vocab.word.toLowerCase())
  );

  if (usedVocabWords.length > 0) {
    await prisma.vocabularyUsage.createMany({
      data: usedVocabWords.map(vocab => ({
        submissionId: submission.id,
        speakerId: speaker?.id,
        word: vocab.word,
        wasFromHint: true,
        usedCorrectly: true,
        cefrLevel: evaluation.overallCefrEstimate,
      })),
    });
  }

  // Update speaker's last active time
  if (speaker) {
    await prisma.speaker.update({
      where: { id: speaker.id },
      data: { lastActiveAt: new Date() },
    });
  }

  // Add messages to chat session
  let activeSessionId: string | undefined = sessionId;

  if (!activeSessionId) {
    try {
      const session = await getOrCreateSessionForTopic(
        accountId,
        topicId,
        speaker?.id
      );
      activeSessionId = session.id;
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }

  if (activeSessionId) {
    try {
      await addMessage({
        sessionId: activeSessionId,
        role: 'user',
        content: userResponse,
        contentType: 'text',
        metadata: { inputMethod, audioUrl },
      });

      const evaluationSummary = evaluation.type === 'translation'
        ? `Score: ${overallScore}/100. ${evaluation.semanticAccuracy.comment} ${evaluation.naturalness.comment}`
        : `Score: ${overallScore}/100. ${evaluation.relevance.comment} ${evaluation.depth.comment}`;

      await addMessage({
        sessionId: activeSessionId,
        role: 'assistant',
        content: evaluationSummary,
        contentType: 'evaluation',
        metadata: {
          overallScore,
          estimatedCefr: evaluation.overallCefrEstimate,
          evaluationType: topicType,
        },
      });

      if (coachReviewText) {
        await addMessage({
          sessionId: activeSessionId,
          role: 'assistant',
          content: coachReviewText,
          contentType: 'evaluation',
          metadata: {
            kind: 'coach_review',
            overallScore,
            estimatedCefr: evaluation.overallCefrEstimate,
            evaluationType: topicType,
            ttsText,
          },
        });
      }
    } catch (err) {
      console.error('Failed to add messages to session:', err);
    }
  }

  return { submissionId: submission.id, sessionId: activeSessionId };
}
