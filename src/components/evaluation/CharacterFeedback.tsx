'use client';

import { useEffect, useState, useCallback } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const character = getCharacter(characterId);
  const { speak, stop, isSpeaking, isLoading: isTTSLoading } = useCharacterTTS(characterId);

  const fetchFeedback = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get character feedback');
      }

      setFeedback(result.data);
    } catch (err) {
      console.error('Character feedback error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setIsLoading(false);
    }
  }, [characterId, overallScore, evaluation, userResponse, topicType, chinesePrompt]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleTTS = () => {
    if (isSpeaking) {
      stop();
    } else if (feedback?.ttsText) {
      speak(feedback.ttsText);
    }
  };

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
        {isLoading && (
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

        {feedback && !isLoading && (
          <>
            <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
              {feedback.feedbackText}
            </div>

            {/* TTS Button */}
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
          </>
        )}
      </div>
    </div>
  );
}
