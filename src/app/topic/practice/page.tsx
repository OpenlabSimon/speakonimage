'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChinesePromptCard } from '@/components/topic/ChinesePromptCard';
import { VocabPanel } from '@/components/topic/VocabPanel';
import { GrammarPanel } from '@/components/topic/GrammarCard';
import { VoiceRecorder } from '@/components/input/VoiceRecorder';
import { TextInput } from '@/components/input/TextInput';
import { EvaluationResult } from '@/components/evaluation/EvaluationResult';
import type { TopicContent, VocabularyItem, GrammarHint, TranslationEvaluationScores, ExpressionEvaluationScores } from '@/types';

interface TopicData {
  type: 'translation' | 'expression';
  chinesePrompt: string;
  keyPoints?: string[];
  guidingQuestions?: string[];
  suggestedVocab: VocabularyItem[];
  grammarHints?: GrammarHint[];
  difficulty?: string;
  difficultyMetadata: {
    targetCefr: string;
    vocabComplexity: number;
    grammarComplexity: number;
  };
}

interface EvaluationData {
  evaluation: TranslationEvaluationScores | ExpressionEvaluationScores;
  overallScore: number;
  inputMethod: string;
}

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
  evaluation: EvaluationData;
}

export default function TopicPracticePage() {
  const router = useRouter();
  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [userResponse, setUserResponse] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationData | null>(null);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load topic data from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('currentTopic');
    if (stored) {
      try {
        setTopicData(JSON.parse(stored));
        // Load previous attempts if any
        const storedAttempts = sessionStorage.getItem('topicAttempts');
        if (storedAttempts) {
          setAttempts(JSON.parse(storedAttempts));
        }
      } catch {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

  // Save attempts to sessionStorage
  const saveAttempts = useCallback((newAttempts: AttemptData[]) => {
    sessionStorage.setItem('topicAttempts', JSON.stringify(newAttempts));
    setAttempts(newAttempts);
  }, []);

  // Convert TopicData to TopicContent for the ChinesePromptCard
  const getTopicContent = (): TopicContent | null => {
    if (!topicData) return null;

    if (topicData.type === 'translation') {
      return {
        type: 'translation',
        chinesePrompt: topicData.chinesePrompt,
        difficulty: (topicData.difficulty || topicData.difficultyMetadata.targetCefr) as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        keyPoints: topicData.keyPoints || [],
        suggestedVocab: topicData.suggestedVocab,
      };
    } else {
      return {
        type: 'expression',
        chinesePrompt: topicData.chinesePrompt,
        guidingQuestions: topicData.guidingQuestions || [],
        suggestedVocab: topicData.suggestedVocab,
        grammarHints: topicData.grammarHints || [],
      };
    }
  };

  // Handle voice transcription
  const handleVoiceTranscription = (text: string, _audioBlob: Blob) => {
    setUserResponse(text);
  };

  // Handle text submission
  const handleTextSubmit = (text: string) => {
    setUserResponse(text);
  };

  // Submit for evaluation
  const handleSubmitForEvaluation = async () => {
    if (!userResponse || !topicData) return;

    setIsEvaluating(true);
    setError(null);

    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicType: topicData.type,
          topicContent: {
            chinesePrompt: topicData.chinesePrompt,
            keyPoints: topicData.keyPoints,
            guidingQuestions: topicData.guidingQuestions,
            suggestedVocab: topicData.suggestedVocab,
            grammarHints: topicData.grammarHints,
          },
          userResponse,
          inputMethod: inputMode,
          historyAttempts: attempts.map(a => ({
            text: a.text,
            score: a.overallScore,
          })),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Evaluation failed');
      }

      // Save this attempt
      const newAttempt: AttemptData = {
        attemptNumber: attempts.length + 1,
        text: userResponse,
        overallScore: result.data.overallScore,
        timestamp: new Date().toISOString(),
        evaluation: result.data,
      };

      const newAttempts = [...attempts, newAttempt];
      saveAttempts(newAttempts);
      setCurrentEvaluation(result.data);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle retry - go back to input mode
  const handleRetry = () => {
    setUserResponse(null);
    setCurrentEvaluation(null);
    setError(null);
  };

  // Handle next topic - clear everything and go to home
  const handleNext = () => {
    sessionStorage.removeItem('currentTopic');
    sessionStorage.removeItem('topicAttempts');
    router.push('/');
  };

  const topicContent = getTopicContent();

  if (!topicData || !topicContent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <div className="text-gray-600">Loading topic...</div>
        </div>
      </div>
    );
  }

  // Show evaluation result
  if (currentEvaluation && userResponse) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Header with attempt count */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.push('/')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Home
            </button>
            <div className="text-sm text-gray-500">
              Attempt #{attempts.length}
            </div>
          </div>

          {/* Evaluation */}
          <EvaluationResult
            evaluation={currentEvaluation.evaluation}
            overallScore={currentEvaluation.overallScore}
            userResponse={userResponse}
            attempts={attempts.map(a => ({
              attemptNumber: a.attemptNumber,
              text: a.text,
              overallScore: a.overallScore,
              timestamp: a.timestamp,
            }))}
            currentAttempt={attempts.length}
            onRetry={handleRetry}
            onNext={handleNext}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            ← Back to Home
          </button>
          {attempts.length > 0 && (
            <div className="text-sm text-gray-500">
              {attempts.length} previous {attempts.length === 1 ? 'attempt' : 'attempts'}
            </div>
          )}
        </div>

        {/* Chinese Prompt */}
        <div className="mb-6">
          <ChinesePromptCard topicContent={topicContent} />
        </div>

        {/* Vocabulary Panel */}
        <div className="mb-6">
          <VocabPanel vocabulary={topicData.suggestedVocab} />
        </div>

        {/* Grammar Panel (only for expression mode) */}
        {topicData.type === 'expression' && topicData.grammarHints && topicData.grammarHints.length > 0 && (
          <div className="mb-6">
            <GrammarPanel grammarHints={topicData.grammarHints} />
          </div>
        )}

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Your Response
            {attempts.length > 0 && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                (Attempt #{attempts.length + 1})
              </span>
            )}
          </h2>

          {/* Show transcription if we have one */}
          {userResponse ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="text-sm text-green-700 font-medium mb-2">Your answer:</div>
                <div className="text-gray-800">{userResponse}</div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Re-enter
                </button>
                <button
                  onClick={handleSubmitForEvaluation}
                  disabled={isEvaluating}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    isEvaluating
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {isEvaluating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⏳</span>
                      Evaluating...
                    </span>
                  ) : (
                    'Get Evaluation'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Input Mode Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setInputMode('voice')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    inputMode === 'voice'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🎤 Voice
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    inputMode === 'text'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  ⌨️ Text
                </button>
              </div>

              {/* Voice Input */}
              {inputMode === 'voice' && (
                <VoiceRecorder
                  onTranscription={handleVoiceTranscription}
                  onError={(error) => setError(error)}
                />
              )}

              {/* Text Input */}
              {inputMode === 'text' && (
                <TextInput
                  onSubmit={handleTextSubmit}
                  placeholder="Type your English response here..."
                />
              )}
            </>
          )}
        </div>

        {/* Previous Attempts Summary */}
        {attempts.length > 0 && !userResponse && (
          <div className="mt-6 bg-white rounded-xl p-4 shadow">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Previous Attempts</h3>
            <div className="space-y-2">
              {attempts.slice(-3).map((attempt) => (
                <div
                  key={attempt.attemptNumber}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                    {attempt.attemptNumber}
                  </div>
                  <div className="flex-1 text-sm text-gray-600 truncate">
                    {attempt.text.substring(0, 40)}...
                  </div>
                  <div className={`font-medium ${
                    attempt.overallScore >= 80 ? 'text-green-600' :
                    attempt.overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {attempt.overallScore}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl">
          <div className="text-sm text-blue-800">
            <strong>💡 Tip:</strong>{' '}
            {topicData.type === 'translation'
              ? "Express the meaning naturally - multiple correct answers are accepted! Focus on conveying the same idea, not word-for-word translation."
              : "Be creative! Use the suggested vocabulary and grammar patterns to enrich your expression. There's no single correct answer."}
          </div>
        </div>
      </div>
    </div>
  );
}
