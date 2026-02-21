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

    // Map result to typed extraction, handling flexible cefrLevel
    const typedResult: TypedExtractionResult = {
      sessionSummary: result.sessionSummary,
      newVocabulary: result.newVocabulary.map((v) => ({
        word: v.word,
        context: v.context,
        mastery: v.mastery,
        cefrLevel: v.cefrLevel as TypedExtractionResult['newVocabulary'][0]['cefrLevel'],
      })),
      errors: result.errors,
      grammarPointsTouched: result.grammarPointsTouched,
      topicsDiscussed: result.topicsDiscussed,
      suggestedFocusNext: result.suggestedFocusNext,
      overallProgress: result.overallProgress,
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
 * Extract and aggregate errors from a session into GrammarError records
 */
export async function saveExtractedErrors(
  session: ChatSession,
  extraction: TypedExtractionResult
): Promise<void> {
  if (!session.speakerId || extraction.errors.length === 0) {
    return;
  }

  // Get existing error patterns for this speaker
  const existingPatterns = await prisma.grammarError.findMany({
    where: { speakerId: session.speakerId },
    select: { errorPattern: true, id: true },
  });

  const existingPatternSet = new Set(existingPatterns.map(e => e.errorPattern.toLowerCase()));

  // Create new error records for new patterns
  const newErrors = extraction.errors
    .filter(e => !existingPatternSet.has(e.pattern.toLowerCase()))
    .map(e => ({
      speakerId: session.speakerId!,
      submissionId: '', // Will need to link to a submission if required
      errorPattern: e.pattern,
      originalText: e.userSaid,
      correctedText: e.correction,
      severity: e.severity,
    }));

  // Note: This creates standalone error records not linked to submissions
  // For the full flow, errors should be linked during submission processing
  if (newErrors.length > 0) {
    console.log(`Extracted ${newErrors.length} new error patterns from session ${session.id}`);
  }
}

/**
 * Extract vocabulary usage from a session
 */
export async function saveExtractedVocabulary(
  session: ChatSession,
  extraction: TypedExtractionResult
): Promise<void> {
  if (!session.speakerId || extraction.newVocabulary.length === 0) {
    return;
  }

  // Get existing vocabulary for this speaker
  const existingVocab = await prisma.vocabularyUsage.findMany({
    where: { speakerId: session.speakerId },
    select: { word: true },
  });

  const existingWords = new Set(existingVocab.map(v => v.word.toLowerCase()));

  // Log new vocabulary (actual tracking happens through submissions)
  const newWords = extraction.newVocabulary.filter(
    v => !existingWords.has(v.word.toLowerCase())
  );

  if (newWords.length > 0) {
    console.log(`Extracted ${newWords.length} new vocabulary items from session ${session.id}`);
  }
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
