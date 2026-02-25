'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCharacter } from '@/lib/characters';
import { useCharacterTTS } from '@/hooks/useCharacterTTS';
import type { TeacherCharacterId } from '@/lib/characters/types';
import type { CharacterFeedback as CharacterFeedbackType } from '@/lib/characters/types';
import type { TranslationEvaluationScores, ExpressionEvaluationScores } from '@/types';

interface CharacterFeedbackProps {
  characterId: TeacherCharacterId;
  overallScore: number;
  evaluation: TranslationEvaluationScores | ExpressionEvaluationScores;
  userResponse: string;
  topicType: string;
  chinesePrompt: string;
}

export function CharacterFeedback({
  characterId,
  overallScore,
  evaluation,
  userResponse,
  topicType,
  chinesePrompt,
}: CharacterFeedbackProps) {
  const [feedback, setFeedback] = useState<CharacterFeedbackType | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const character = getCharacter(characterId);
  const { speak, stop, isSpeaking, isLoading: isTTSLoading } = useCharacterTTS(characterId);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFeedback = useCallback(async () => {
    // Abort any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setFeedback(null);
    setStreamingText('');

    try {
      const response = await fetch('/api/characterize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          overallScore,
          evaluation,
          userResponse,
          topicType,
          chinesePrompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to get character feedback');
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let rawJson = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (!payload) continue;

          try {
            const event = JSON.parse(payload);

            if (event.type === 'delta') {
              rawJson += event.text;
              // Try to extract feedbackText from partial JSON for live display
              const feedbackMatch = rawJson.match(/"feedbackText"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
              if (feedbackMatch) {
                // Unescape JSON string escapes
                const text = feedbackMatch[1]
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
                setStreamingText(text);
              }
            } else if (event.type === 'done') {
              setFeedback(event.data);
              setStreamingText('');
              setIsLoading(false);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) {
            // Ignore parse errors on partial data
            if (parseErr instanceof Error && parseErr.message !== 'Stream error') {
              // Only rethrow explicit error events
              if (payload.includes('"type":"error"')) throw parseErr;
            }
          }
        }
      }

      // If stream ended without a 'done' event, mark as done
      if (!feedback) {
        setIsLoading(false);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Character feedback error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
      setIsLoading(false);
    }
  }, [characterId, overallScore, evaluation, userResponse, topicType, chinesePrompt]);

  useEffect(() => {
    fetchFeedback();
    return () => { abortRef.current?.abort(); };
  }, [fetchFeedback]);

  const handleTTS = () => {
    if (isSpeaking) {
      stop();
    } else if (feedback?.ttsText) {
      speak(feedback.ttsText);
    }
  };

  // Show streaming text while loading, final feedback when done
  const displayText = feedback ? feedback.feedbackText : streamingText;

  return (
    <div className={`rounded-xl border-2 ${character.classes.border} ${character.classes.bgLight} overflow-hidden mb-4`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-2 ${character.classes.bgLight}`}>
        <span className="text-2xl">{character.emoji}</span>
        <div>
          <div className={`font-medium ${character.classes.textDark}`}>{character.name}</div>
          <div className="text-xs text-gray-400">{character.tagline}</div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isLoading && !displayText && (
          <div className={`flex items-center gap-2 ${character.classes.text}`}>
            <span className="animate-pulse">...</span>
            <span className="text-sm">{character.name}正在思考...</span>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600">
            {error}
            <button
              onClick={fetchFeedback}
              className="ml-2 underline hover:no-underline"
            >
              重试
            </button>
          </div>
        )}

        {displayText && (
          <>
            <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
              {displayText}
              {isLoading && <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />}
            </div>

            {/* TTS Button — only show when fully loaded */}
            {feedback && (
              <button
                onClick={handleTTS}
                disabled={isTTSLoading}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isSpeaking
                    ? `${character.classes.bg} text-white`
                    : `${character.classes.bgLight} ${character.classes.textDark} border ${character.classes.border} hover:opacity-80`
                } disabled:opacity-50`}
              >
                {isTTSLoading ? (
                  <span className="animate-spin">...</span>
                ) : isSpeaking ? (
                  '⏹ 停止'
                ) : (
                  '🔊 听反馈'
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
