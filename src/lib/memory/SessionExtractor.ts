// SessionExtractor - extract learning data from completed sessions

import { getLLMProvider } from '@/lib/llm';
import { prisma } from '@/lib/db';
import {
  SessionExtractionSchema,
  SESSION_EXTRACTION_SYSTEM_PROMPT,
  buildSessionExtractionPrompt,
  type SessionExtractionResult,
} from '@/lib/llm/prompts/extract-session';
import type { ChatSession, ChatMessage, SessionExtractionResult as TypedExtractionResult } from './types';

/**
 * Extract learning data from session messages
 */
export async function extractSessionLearningData(
  messages: ChatMessage[],
  session: ChatSession
): Promise<TypedExtractionResult> {
  if (messages.length === 0) {
    return createEmptyExtraction();
  }

  // Format messages for the prompt
  const formattedMessages = messages
    .map((m) => {
      const roleLabel = m.role === 'user' ? 'Student' : m.role === 'assistant' ? 'Teacher' : 'System';
      const timestamp = m.createdAt.toLocaleTimeString();
      return `[${timestamp}] ${roleLabel}: ${m.content}`;
    })
    .join('\n\n');

  // Get topic info if available
  let topicInfo: string | undefined;
  if (session.topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: session.topicId },
      select: { type: true, originalInput: true, topicContent: true },
    });

    if (topic) {
      const content = topic.topicContent as { chinesePrompt?: string };
      topicInfo = `类型: ${topic.type === 'translation' ? '翻译挑战' : '话题表达'}
原始输入: ${topic.originalInput}
题目: ${content.chinesePrompt || ''}`;
    }
  }

  const prompt = buildSessionExtractionPrompt(
    formattedMessages,
    session.sessionType,
    topicInfo
  );

  const llm = getLLMProvider();

  try {
    const result = await llm.generateJSON(
      prompt,
      SessionExtractionSchema,
      SESSION_EXTRACTION_SYSTEM_PROMPT
    );

    // Map result to typed extraction, casting flexible LLM strings to strict types
    const typedResult: TypedExtractionResult = {
      sessionSummary: result.sessionSummary,
      newVocabulary: result.newVocabulary.map((v) => ({
        word: v.word,
        context: v.context,
        mastery: (v.mastery || 'new') as 'new' | 'developing' | 'mastered',
        cefrLevel: v.cefrLevel as TypedExtractionResult['newVocabulary'][0]['cefrLevel'],
      })),
      errors: result.errors.map((e) => ({
        ...e,
        severity: (e.severity || 'medium') as 'low' | 'medium' | 'high',
      })),
      grammarPointsTouched: result.grammarPointsTouched,
      topicsDiscussed: result.topicsDiscussed,
      suggestedFocusNext: result.suggestedFocusNext,
      overallProgress: (result.overallProgress || 'stable') as 'improving' | 'stable' | 'struggling',
      extractedAt: new Date(),
    };

    return typedResult;
  } catch (error) {
    console.error('Session extraction failed:', error);
    return createEmptyExtraction();
  }
}

/**
 * Create an empty extraction result
 */
function createEmptyExtraction(): TypedExtractionResult {
  return {
    sessionSummary: '',
    newVocabulary: [],
    errors: [],
    grammarPointsTouched: [],
    topicsDiscussed: [],
    suggestedFocusNext: [],
    overallProgress: 'stable',
    extractedAt: new Date(),
  };
}

/**
 * Extract and aggregate errors from a session into GrammarError records.
 * Links errors to the most recent submission in the session.
 */
export async function saveExtractedErrors(
  session: ChatSession,
  extraction: TypedExtractionResult
): Promise<void> {
  if (!session.speakerId || extraction.errors.length === 0) {
    return;
  }

  // Find the most recent submission in this session's topic to link errors to
  const recentSubmission = await prisma.submission.findFirst({
    where: {
      speakerId: session.speakerId,
      ...(session.topicId ? { topicId: session.topicId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!recentSubmission) {
    return;
  }

  const errorRecords = extraction.errors.map((e) => ({
    submissionId: recentSubmission.id,
    speakerId: session.speakerId!,
    errorPattern: e.pattern,
    originalText: e.userSaid,
    correctedText: e.correction,
    severity: e.severity,
  }));

  await prisma.grammarError.createMany({ data: errorRecords });
}

/**
 * Extract vocabulary usage from a session and write to VocabularyUsage table.
 * Links vocab to the most recent submission in the session.
 */
export async function saveExtractedVocabulary(
  session: ChatSession,
  extraction: TypedExtractionResult
): Promise<void> {
  if (!session.speakerId || extraction.newVocabulary.length === 0) {
    return;
  }

  // Find the most recent submission in this session's topic
  const recentSubmission = await prisma.submission.findFirst({
    where: {
      speakerId: session.speakerId,
      ...(session.topicId ? { topicId: session.topicId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!recentSubmission) {
    return;
  }

  const vocabRecords = extraction.newVocabulary.map((v) => ({
    submissionId: recentSubmission.id,
    speakerId: session.speakerId!,
    word: v.word,
    wasFromHint: false,
    usedCorrectly: v.mastery !== 'new',
    cefrLevel: v.cefrLevel || null,
  }));

  await prisma.vocabularyUsage.createMany({ data: vocabRecords });
}

/**
 * Process a completed session - extract data and update profile
 */
export async function processSessionEnd(sessionId: string): Promise<TypedExtractionResult | null> {
  // Import dynamically to avoid circular dependency
  const { getSession, getMessages } = await import('./ConversationManager');

  const session = await getSession(sessionId);
  if (!session) {
    console.error(`Session not found: ${sessionId}`);
    return null;
  }

  const messages = await getMessages(sessionId);
  if (messages.length === 0) {
    return null;
  }

  const extraction = await extractSessionLearningData(messages, session);

  // Save extraction result to session
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      extractedData: extraction as object,
    },
  });

  // Save extracted data to tracking tables
  if (session.speakerId) {
    await Promise.all([
      saveExtractedErrors(session, extraction),
      saveExtractedVocabulary(session, extraction),
    ]);
  }

  return extraction;
}
