// ConversationManager - core service for managing chat sessions and messages

import { prisma } from '@/lib/db';
import type {
  ChatSession,
  ChatMessage,
  CreateSessionInput,
  AddMessageInput,
  ConversationContext,
  ContextBuildOptions,
  ContextMessage,
  SessionStatus,
  EndSessionOptions,
} from './types';
import { compressContext, estimateTokens } from './ContextCompressor';
import { extractSessionLearningData } from './SessionExtractor';
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';

// Default context building options
const DEFAULT_CONTEXT_OPTIONS: Required<ContextBuildOptions> = {
  maxTokens: 4000,
  maxMessages: 20,
  includeSystemMessages: false,
  compressionThreshold: 20,
};

/**
 * Create a new chat session
 */
export async function createSession(input: CreateSessionInput): Promise<ChatSession> {
  const session = await prisma.chatSession.create({
    data: {
      accountId: input.accountId,
      speakerId: input.speakerId,
      topicId: input.topicId,
      sessionType: input.sessionType || 'practice',
      status: 'active',
      messageCount: 0,
    },
  });

  return {
    id: session.id,
    accountId: session.accountId,
    speakerId: session.speakerId || undefined,
    topicId: session.topicId || undefined,
    sessionType: session.sessionType as 'practice' | 'review',
    status: session.status as SessionStatus,
    startedAt: session.startedAt,
    endedAt: session.endedAt || undefined,
    messageCount: session.messageCount,
  };
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return null;

  return {
    id: session.id,
    accountId: session.accountId,
    speakerId: session.speakerId || undefined,
    topicId: session.topicId || undefined,
    sessionType: session.sessionType as 'practice' | 'review',
    status: session.status as SessionStatus,
    startedAt: session.startedAt,
    endedAt: session.endedAt || undefined,
    contextSummary: session.contextSummary as unknown as ChatSession['contextSummary'],
    messageCount: session.messageCount,
    extractedData: session.extractedData as unknown as ChatSession['extractedData'],
  };
}

/**
 * Get active session for an account (most recent active)
 */
export async function getActiveSession(accountId: string, topicId?: string): Promise<ChatSession | null> {
  const where: {
    accountId: string;
    status: string;
    topicId?: string;
  } = {
    accountId,
    status: 'active',
  };

  if (topicId) {
    where.topicId = topicId;
  }

  const session = await prisma.chatSession.findFirst({
    where,
    orderBy: { startedAt: 'desc' },
  });

  if (!session) return null;

  return {
    id: session.id,
    accountId: session.accountId,
    speakerId: session.speakerId || undefined,
    topicId: session.topicId || undefined,
    sessionType: session.sessionType as 'practice' | 'review',
    status: session.status as SessionStatus,
    startedAt: session.startedAt,
    endedAt: session.endedAt || undefined,
    contextSummary: session.contextSummary as unknown as ChatSession['contextSummary'],
    messageCount: session.messageCount,
    extractedData: session.extractedData as unknown as ChatSession['extractedData'],
  };
}

/**
 * Add a message to a session
 */
export async function addMessage(input: AddMessageInput): Promise<ChatMessage> {
  const message = await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      contentType: input.contentType || 'text',
      metadata: input.metadata as object || null,
    },
  });

  // Update session message count
  await prisma.chatSession.update({
    where: { id: input.sessionId },
    data: {
      messageCount: { increment: 1 },
    },
  });

  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role as ChatMessage['role'],
    content: message.content,
    contentType: message.contentType as ChatMessage['contentType'],
    metadata: message.metadata as ChatMessage['metadata'],
    createdAt: message.createdAt,
  };
}

/**
 * Get messages for a session
 */
export async function getMessages(
  sessionId: string,
  options?: { limit?: number; offset?: number }
): Promise<ChatMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: options?.limit,
    skip: options?.offset,
  });

  return messages.map((msg) => ({
    id: msg.id,
    sessionId: msg.sessionId,
    role: msg.role as ChatMessage['role'],
    content: msg.content,
    contentType: msg.contentType as ChatMessage['contentType'],
    metadata: msg.metadata as ChatMessage['metadata'],
    createdAt: msg.createdAt,
  }));
}

/**
 * Build conversation context for prompt injection
 * Handles compression of long conversations
 */
export async function getContextForPrompt(
  sessionId: string,
  options?: ContextBuildOptions
): Promise<ConversationContext> {
  const opts = { ...DEFAULT_CONTEXT_OPTIONS, ...options };
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get all messages
  const allMessages = await getMessages(sessionId);

  // Filter out system messages if not wanted
  const filteredMessages = opts.includeSystemMessages
    ? allMessages
    : allMessages.filter((m) => m.role !== 'system');

  // Check if compression is needed
  const needsCompression = filteredMessages.length > opts.compressionThreshold;

  let contextMessages: ContextMessage[];
  let summary: string | undefined;

  if (needsCompression) {
    // Compress older messages, keep recent ones
    const recentCount = Math.min(10, Math.floor(opts.maxMessages / 2));
    const olderMessages = filteredMessages.slice(0, -recentCount);
    const recentMessages = filteredMessages.slice(-recentCount);

    // Compress older messages
    const compressed = await compressContext(olderMessages);
    summary = compressed.summary;

    // Update session with compressed summary
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        contextSummary: {
          summary: compressed.summary,
          keyPoints: compressed.keyPoints,
          messagesCovered: olderMessages.length,
          compressedAt: new Date(),
        },
      },
    });

    contextMessages = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
      score: m.metadata?.overallScore,
    }));
  } else {
    // Use existing summary if available, otherwise just use recent messages
    if (session.contextSummary) {
      summary = session.contextSummary.summary;
    }

    // Apply token limit
    contextMessages = [];
    let tokenCount = summary ? estimateTokens(summary) : 0;

    // Add messages from newest to oldest until we hit the limit
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      const msg = filteredMessages[i];
      const msgTokens = estimateTokens(msg.content);

      if (tokenCount + msgTokens > opts.maxTokens) break;

      contextMessages.unshift({
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
        score: msg.metadata?.overallScore,
      });

      tokenCount += msgTokens;
    }
  }

  return {
    sessionId,
    messages: contextMessages,
    summary,
    totalMessageCount: filteredMessages.length,
    includesCompression: needsCompression || !!session.contextSummary,
  };
}

/**
 * End a session and optionally extract learning data
 */
export async function endSession(
  sessionId: string,
  options?: EndSessionOptions
): Promise<ChatSession> {
  const opts = { extractLearningData: true, updateProfile: true, ...options };
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.status === 'ended') {
    return session;
  }

  let extractedData = null;

  // Extract learning data if requested and there are messages
  if (opts.extractLearningData && session.messageCount > 0) {
    const messages = await getMessages(sessionId);
    extractedData = await extractSessionLearningData(messages, session);

    // Update speaker profile via ProfileManager (DB aggregation, no LLM)
    if (opts.updateProfile && session.speakerId) {
      await computeAndUpdateProfile(session.speakerId);
    }
  }

  // Update session status
  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      status: 'ended',
      endedAt: new Date(),
      extractedData: extractedData as object || null,
    },
  });

  return {
    id: updated.id,
    accountId: updated.accountId,
    speakerId: updated.speakerId || undefined,
    topicId: updated.topicId || undefined,
    sessionType: updated.sessionType as 'practice' | 'review',
    status: updated.status as SessionStatus,
    startedAt: updated.startedAt,
    endedAt: updated.endedAt || undefined,
    contextSummary: updated.contextSummary as unknown as ChatSession['contextSummary'],
    messageCount: updated.messageCount,
    extractedData: updated.extractedData as unknown as ChatSession['extractedData'],
  };
}

/**
 * List sessions for an account
 */
export async function listSessions(
  accountId: string,
  options?: {
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<ChatSession[]> {
  const sessions = await prisma.chatSession.findMany({
    where: {
      accountId,
      ...(options?.status && { status: options.status }),
    },
    orderBy: { startedAt: 'desc' },
    take: options?.limit || 10,
    skip: options?.offset,
  });

  return sessions.map((s) => ({
    id: s.id,
    accountId: s.accountId,
    speakerId: s.speakerId || undefined,
    topicId: s.topicId || undefined,
    sessionType: s.sessionType as 'practice' | 'review',
    status: s.status as SessionStatus,
    startedAt: s.startedAt,
    endedAt: s.endedAt || undefined,
    contextSummary: s.contextSummary as unknown as ChatSession['contextSummary'],
    messageCount: s.messageCount,
    extractedData: s.extractedData as unknown as ChatSession['extractedData'],
  }));
}

/**
 * Get or create an active session for practicing a topic
 */
export async function getOrCreateSessionForTopic(
  accountId: string,
  topicId: string,
  speakerId?: string
): Promise<ChatSession> {
  // Try to find an existing active session for this topic
  const existing = await getActiveSession(accountId, topicId);
  if (existing) {
    return existing;
  }

  // Create a new session
  return createSession({
    accountId,
    speakerId,
    topicId,
    sessionType: 'practice',
  });
}
