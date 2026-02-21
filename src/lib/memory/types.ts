// Memory system types for conversation context and learning data extraction

import type { CEFRLevel, GrammarErrorItem } from '@/types';

// Session types
export type SessionType = 'practice' | 'review';
export type SessionStatus = 'active' | 'ended';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageContentType = 'text' | 'evaluation';

// Chat session interface
export interface ChatSession {
  id: string;
  accountId: string;
  speakerId?: string;
  topicId?: string;
  sessionType: SessionType;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  contextSummary?: ContextSummary;
  messageCount: number;
  extractedData?: SessionExtractionResult;
}

// Chat message interface
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
  metadata?: MessageMetadata;
  createdAt: Date;
}

// Message metadata for different message types
export interface MessageMetadata {
  // For user messages
  inputMethod?: 'voice' | 'text';
  audioUrl?: string;
  transcriptionConfidence?: number;

  // For assistant messages (evaluation)
  overallScore?: number;
  estimatedCefr?: CEFRLevel;
  evaluationType?: 'translation' | 'expression';

  // For system messages
  systemMessageType?: 'topic_context' | 'profile_injection' | 'context_summary';
}

// Context summary for long conversations (compression)
export interface ContextSummary {
  summary: string;
  keyPoints: string[];
  messagesCovered: number;  // Number of messages summarized
  compressedAt: Date;
}

// Session extraction result - learning data extracted at session end
export interface SessionExtractionResult {
  sessionSummary: string;
  newVocabulary: ExtractedVocabulary[];
  errors: ExtractedError[];
  grammarPointsTouched: string[];
  topicsDiscussed: string[];
  suggestedFocusNext: string[];
  overallProgress: 'improving' | 'stable' | 'struggling';
  extractedAt: Date;
}

// Extracted vocabulary from session
export interface ExtractedVocabulary {
  word: string;
  context: string;
  mastery: 'new' | 'developing' | 'mastered';
  cefrLevel?: CEFRLevel;
}

// Extracted error from session
export interface ExtractedError {
  type: string;  // Grammar category: 'tense', 'article', 'preposition', etc.
  userSaid: string;
  correction: string;
  pattern: string;  // Generalized pattern for this error type
  severity: 'low' | 'medium' | 'high';
  isRecurring: boolean;  // True if this pattern appeared multiple times
}

// Conversation context for prompt injection
export interface ConversationContext {
  sessionId: string;
  messages: ContextMessage[];
  summary?: string;  // Compressed summary of older messages
  totalMessageCount: number;
  includesCompression: boolean;
}

// Simplified message for context injection
export interface ContextMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  score?: number;  // For evaluation messages
}

// Options for building conversation context
export interface ContextBuildOptions {
  maxTokens?: number;  // Default: 4000
  maxMessages?: number;  // Default: 20
  includeSystemMessages?: boolean;  // Default: false
  compressionThreshold?: number;  // Compress if messages exceed this. Default: 20
}

// Session creation input
export interface CreateSessionInput {
  accountId: string;
  speakerId?: string;
  topicId?: string;
  sessionType?: SessionType;
}

// Add message input
export interface AddMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType?: MessageContentType;
  metadata?: MessageMetadata;
}

// Session end options
export interface EndSessionOptions {
  extractLearningData?: boolean;  // Default: true
  updateProfile?: boolean;  // Default: true
}

// Profile update from session extraction
export interface ProfileUpdateFromSession {
  vocabularyToAdd: {
    word: string;
    mastery: number;  // 0.0-1.0
    cefrLevel?: CEFRLevel;
  }[];
  errorsToTrack: {
    pattern: string;
    severity: 'low' | 'medium' | 'high';
    isNew: boolean;
  }[];
  grammarPointsTouched: string[];
  suggestedFocus: string[];
}

// Token estimation for context building
export interface TokenEstimate {
  estimated: number;
  method: 'approximate';  // We use ~4 chars per token approximation
}
