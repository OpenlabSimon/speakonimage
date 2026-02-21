// Memory system - conversation context and learning data management

// Re-export types
export * from './types';

// Re-export conversation manager functions
export {
  createSession,
  getSession,
  getActiveSession,
  addMessage,
  getMessages,
  getContextForPrompt,
  endSession,
  listSessions,
  getOrCreateSessionForTopic,
} from './ConversationManager';

// Re-export context compression utilities
export {
  compressContext,
  estimateTokens,
  estimateMessagesTokens,
  needsCompression,
  splitForCompression,
  formatSummaryForPrompt,
} from './ContextCompressor';

// Re-export session extraction functions
export {
  extractSessionLearningData,
  processSessionEnd,
} from './SessionExtractor';
