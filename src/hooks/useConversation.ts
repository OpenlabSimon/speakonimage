// useConversation - React hook for managing conversation sessions

import { useState, useCallback, useEffect, useRef } from 'react';

// Types for the hook (client-side, matching API responses)
interface ChatSession {
  id: string;
  accountId: string;
  speakerId?: string;
  topicId?: string;
  sessionType: 'practice' | 'review';
  status: 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
  messageCount: number;
  extractedData?: SessionExtractionResult;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: 'text' | 'evaluation';
  metadata?: MessageMetadata;
  createdAt: string;
}

interface MessageMetadata {
  inputMethod?: 'voice' | 'text';
  audioUrl?: string;
  overallScore?: number;
  estimatedCefr?: string;
  evaluationType?: 'translation' | 'expression';
}

interface SessionExtractionResult {
  sessionSummary: string;
  newVocabulary: Array<{
    word: string;
    context: string;
    mastery: 'new' | 'developing' | 'mastered';
  }>;
  errors: Array<{
    type: string;
    userSaid: string;
    correction: string;
    pattern: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  grammarPointsTouched: string[];
  topicsDiscussed: string[];
  suggestedFocusNext: string[];
  overallProgress: 'improving' | 'stable' | 'struggling';
}

interface UseConversationOptions {
  topicId?: string;
  autoStart?: boolean;  // Automatically create session on mount
}

interface UseConversationReturn {
  // Session state
  session: ChatSession | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  // Session actions
  startSession: (topicId?: string) => Promise<ChatSession | null>;
  endSession: () => Promise<void>;

  // Message actions
  addUserMessage: (content: string, metadata?: MessageMetadata) => Promise<ChatMessage | null>;
  addAssistantMessage: (content: string, metadata?: MessageMetadata) => Promise<ChatMessage | null>;

  // Utilities
  refreshMessages: () => Promise<void>;
  clearError: () => void;
}

export function useConversation(options: UseConversationOptions = {}): UseConversationReturn {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<ChatSession | null>(null);
  sessionRef.current = session;

  /**
   * Create a new session
   */
  const startSession = useCallback(async (topicId?: string): Promise<ChatSession | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topicId || options.topicId,
          sessionType: 'practice',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create session');
      }

      const newSession = result.data as ChatSession;
      setSession(newSession);
      setMessages([]);  // Clear any previous messages

      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options.topicId]);

  /**
   * End the current session
   */
  const endSession = useCallback(async (): Promise<void> => {
    if (!sessionRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionRef.current.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to end session');
      }

      setSession(result.data as ChatSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add a message to the session
   */
  const addMessage = useCallback(async (
    role: 'user' | 'assistant',
    content: string,
    metadata?: MessageMetadata
  ): Promise<ChatMessage | null> => {
    if (!sessionRef.current) {
      setError('No active session');
      return null;
    }

    if (sessionRef.current.status === 'ended') {
      setError('Session has ended');
      return null;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionRef.current.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          content,
          contentType: metadata?.overallScore !== undefined ? 'evaluation' : 'text',
          metadata,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to add message');
      }

      const newMessage = result.data as ChatMessage;
      setMessages(prev => [...prev, newMessage]);

      // Update session message count
      setSession(prev => prev ? { ...prev, messageCount: prev.messageCount + 1 } : null);

      return newMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add message';
      setError(message);
      return null;
    }
  }, []);

  /**
   * Add a user message
   */
  const addUserMessage = useCallback(async (
    content: string,
    metadata?: MessageMetadata
  ): Promise<ChatMessage | null> => {
    return addMessage('user', content, metadata);
  }, [addMessage]);

  /**
   * Add an assistant message
   */
  const addAssistantMessage = useCallback(async (
    content: string,
    metadata?: MessageMetadata
  ): Promise<ChatMessage | null> => {
    return addMessage('assistant', content, metadata);
  }, [addMessage]);

  /**
   * Refresh messages from the server
   */
  const refreshMessages = useCallback(async (): Promise<void> => {
    if (!sessionRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionRef.current.id}/messages`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch messages');
      }

      setMessages(result.data.messages as ChatMessage[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Auto-start session if configured
   */
  useEffect(() => {
    if (options.autoStart && options.topicId && !session) {
      startSession(options.topicId);
    }
  }, [options.autoStart, options.topicId, session, startSession]);

  return {
    session,
    messages,
    isLoading,
    error,
    startSession,
    endSession,
    addUserMessage,
    addAssistantMessage,
    refreshMessages,
    clearError,
  };
}

export default useConversation;
