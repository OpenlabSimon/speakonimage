'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChinesePromptCard } from '@/components/topic/ChinesePromptCard';
import { VocabPanel } from '@/components/topic/VocabPanel';
import { GrammarPanel } from '@/components/topic/GrammarCard';
import { VoiceRecorder } from '@/components/input/VoiceRecorder';
import { TextInput } from '@/components/input/TextInput';
import { EvaluationResult } from '@/components/evaluation/EvaluationResult';
import { CharacterSelector } from '@/components/evaluation/CharacterSelector';
import { LevelChangeModal } from '@/components/assessment/LevelChangeModal';
import { useLevelHistory, type LevelChangeResult } from '@/hooks/useLevelHistory';
import { useConversation } from '@/hooks/useConversation';
import { useCharacterSelection } from '@/hooks/useCharacterSelection';
import type {
  TopicContent,
  VocabularyItem,
  GrammarHint,
  TranslationEvaluationScores,
  ExpressionEvaluationScores,
  CEFRLevel,
} from '@/types';

interface TopicData {
  id?: string; // Database ID (if authenticated)
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
  audioUrl?: string;
}

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
  audioUrl?: string;
  evaluation: EvaluationData;
}

export default function TopicPracticePage() {
  const router = useRouter();
  const { data: authSession } = useSession();
  const isAuthenticated = !!authSession?.user;
  const { addScore, upgradeLevel, setLevel, getCurrentLevel } = useLevelHistory();
  const { characterId, setCharacterId } = useCharacterSelection();

  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [userResponse, setUserResponse] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] =
    useState<EvaluationData | null>(null);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Level downgrade modal state
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [pendingDowngrade, setPendingDowngrade] = useState<LevelChangeResult | null>(null);

  // Conversation session for memory system
  const conversation = useConversation({
    topicId: topicData?.id,
    autoStart: true,
    isAuthenticated,
  });

  // Load topic data from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('currentTopic');
    if (stored) {
      try {
        setTopicData(JSON.parse(stored));
        // Load previous attempts if any
        const storedAttempts = localStorage.getItem('topicAttempts');
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

  // Save attempts to localStorage
  const saveAttempts = useCallback((newAttempts: AttemptData[]) => {
    localStorage.setItem('topicAttempts', JSON.stringify(newAttempts));
    setAttempts(newAttempts);
  }, []);

  // Update level history — only auto-downgrades, never auto-upgrades
  const updateLevelHistory = useCallback(
    (score: number, estimatedLevel: CEFRLevel) => {
      const result = addScore(score, estimatedLevel);

      if (result.downgraded) {
        setPendingDowngrade(result);
        setShowLevelModal(true);
      }
    },
    [addScore]
  );

  // Handle downgrade modal accept (accept the downgrade, already applied)
  const handleLevelAccept = useCallback(() => {
    setShowLevelModal(false);
    setPendingDowngrade(null);
  }, []);

  // Handle downgrade modal decline (user wants to stay at original level)
  const handleLevelDecline = useCallback(() => {
    if (pendingDowngrade) {
      setLevel(pendingDowngrade.fromLevel);
    }
    setShowLevelModal(false);
    setPendingDowngrade(null);
  }, [pendingDowngrade, setLevel]);

  // Handle manual level selection from modal
  const handleManualLevelSelect = useCallback(
    (level: CEFRLevel) => {
      setLevel(level);
      setShowLevelModal(false);
      setPendingDowngrade(null);
    },
    [setLevel]
  );

  // Convert TopicData to TopicContent for the ChinesePromptCard
  const getTopicContent = (): TopicContent | null => {
    if (!topicData) return null;

    if (topicData.type === 'translation') {
      return {
        type: 'translation',
        chinesePrompt: topicData.chinesePrompt,
        difficulty: (topicData.difficulty ||
          topicData.difficultyMetadata.targetCefr) as CEFRLevel,
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

  // Handle voice transcription + evaluation (combined)
  const handleVoiceResult = (result: {
    transcription: string;
    audioUrl?: string;
    evaluation?: unknown;
    overallScore?: number;
  }) => {
    setUserResponse(result.transcription);

    if (result.evaluation && result.overallScore !== undefined) {
      const evalData: EvaluationData = {
        evaluation:
          result.evaluation as
            | TranslationEvaluationScores
            | ExpressionEvaluationScores,
        overallScore: result.overallScore,
        inputMethod: 'voice',
        audioUrl: result.audioUrl,
      };

      // Save this attempt
      const newAttempt: AttemptData = {
        attemptNumber: attempts.length + 1,
        text: result.transcription,
        overallScore: result.overallScore,
        timestamp: new Date().toISOString(),
        audioUrl: result.audioUrl,
        evaluation: evalData,
      };

      const newAttempts = [...attempts, newAttempt];
      saveAttempts(newAttempts);
      setCurrentEvaluation(evalData);

      // Update level history with the score
      const estimatedLevel = evalData.evaluation.overallCefrEstimate;
      updateLevelHistory(result.overallScore, estimatedLevel);
    }
  };

  // Handle text submission
  const handleTextSubmit = async (text: string) => {
    if (!topicData) return;

    setUserResponse(text);
    setIsEvaluating(true);
    setError(null);

    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topicData.id, // Pass topic ID for database persistence
          sessionId: conversation.session?.id, // Pass session ID for memory system
          topicType: topicData.type,
          topicContent: {
            chinesePrompt: topicData.chinesePrompt,
            keyPoints: topicData.keyPoints,
            guidingQuestions: topicData.guidingQuestions,
            suggestedVocab: topicData.suggestedVocab,
            grammarHints: topicData.grammarHints,
          },
          userResponse: text,
          inputMethod: 'text',
          historyAttempts: attempts.map((a) => ({
            text: a.text,
            score: a.overallScore,
          })),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '评估失败');
      }

      // Save this attempt
      const newAttempt: AttemptData = {
        attemptNumber: attempts.length + 1,
        text,
        overallScore: result.data.overallScore,
        timestamp: new Date().toISOString(),
        evaluation: result.data,
      };

      const newAttempts = [...attempts, newAttempt];
      saveAttempts(newAttempts);
      setCurrentEvaluation(result.data);

      // Update level history with the score
      const estimatedLevel = result.data.evaluation.overallCefrEstimate;
      updateLevelHistory(result.data.overallScore, estimatedLevel);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : '评估失败');
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

  // Handle next topic - end session, clear everything and go to home
  const handleNext = async () => {
    await conversation.endSession();
    localStorage.removeItem('currentTopic');
    localStorage.removeItem('topicAttempts');
    router.push('/');
  };

  // Play stored recording
  const playRecording = (audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play();
  };

  const topicContent = getTopicContent();

  if (!topicData || !topicContent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div className="text-gray-600">加载话题中...</div>
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
              &larr; 首页
            </button>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                第 {attempts.length} 次尝试
              </div>
              <div className="flex items-center gap-1">
                <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                  等级: {getCurrentLevel()}
                </div>
                {getCurrentLevel() !== 'C2' && (
                  <button
                    onClick={upgradeLevel}
                    className="px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                    title="升级难度"
                  >
                    升级
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Play Recording Button */}
          {currentEvaluation.audioUrl && (
            <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-center justify-between">
              <span className="text-sm text-blue-700">
                你的录音已保存
              </span>
              <button
                onClick={() => playRecording(currentEvaluation.audioUrl!)}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
              >
                播放录音
              </button>
            </div>
          )}

          {/* Evaluation */}
          <EvaluationResult
            evaluation={currentEvaluation.evaluation}
            overallScore={currentEvaluation.overallScore}
            userResponse={userResponse}
            attempts={attempts.map((a) => ({
              attemptNumber: a.attemptNumber,
              text: a.text,
              overallScore: a.overallScore,
              timestamp: a.timestamp,
            }))}
            currentAttempt={attempts.length}
            onRetry={handleRetry}
            onNext={handleNext}
            characterId={characterId}
            topicType={topicData.type}
            chinesePrompt={topicData.chinesePrompt}
            inputMethod={currentEvaluation.inputMethod as 'voice' | 'text'}
          />

          {/* Previous Recordings */}
          {attempts.filter((a) => a.audioUrl).length > 1 && (
            <div className="mt-6 bg-white rounded-xl p-4 shadow">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                之前的录音
              </h3>
              <div className="space-y-2">
                {attempts
                  .filter((a) => a.audioUrl)
                  .map((attempt) => (
                    <div
                      key={attempt.attemptNumber}
                      className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                        {attempt.attemptNumber}
                      </div>
                      <div className="flex-1 text-sm text-gray-600 truncate">
                        {attempt.text.substring(0, 30)}...
                      </div>
                      <div
                        className={`font-medium mr-2 ${
                          attempt.overallScore >= 80
                            ? 'text-green-600'
                            : attempt.overallScore >= 60
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {attempt.overallScore}
                      </div>
                      <button
                        onClick={() => playRecording(attempt.audioUrl!)}
                        className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                      >
                        播放
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Level Change Modal */}
        {pendingDowngrade && (
          <LevelChangeModal
            isOpen={showLevelModal}
            direction="down"
            fromLevel={pendingDowngrade.fromLevel}
            toLevel={pendingDowngrade.toLevel}
            onAccept={handleLevelAccept}
            onDecline={handleLevelDecline}
            onManualSelect={handleManualLevelSelect}
          />
        )}
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
            &larr; 返回首页
          </button>
          <div className="flex items-center gap-4">
            {attempts.length > 0 && (
              <div className="text-sm text-gray-500">
                已尝试 {attempts.length} 次
              </div>
            )}
            <div className="flex items-center gap-1">
              <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                等级: {getCurrentLevel()}
              </div>
              {getCurrentLevel() !== 'C2' && (
                <button
                  onClick={upgradeLevel}
                  className="px-2 py-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                  title="升级难度"
                >
                  升级
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Teacher Character Selector */}
        <div className="mb-4">
          <CharacterSelector selectedId={characterId} onSelect={setCharacterId} />
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
        {topicData.type === 'expression' &&
          topicData.grammarHints &&
          topicData.grammarHints.length > 0 && (
            <div className="mb-6">
              <GrammarPanel grammarHints={topicData.grammarHints} />
            </div>
          )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            你的回答
            {attempts.length > 0 && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                (第 {attempts.length + 1} 次尝试)
              </span>
            )}
          </h2>

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
              语音
            </button>
            <button
              onClick={() => setInputMode('text')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                inputMode === 'text'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              文字
            </button>
          </div>

          {/* Voice Input - auto evaluates */}
          {inputMode === 'voice' && (
            <VoiceRecorder
              onTranscriptionAndEvaluation={handleVoiceResult}
              topicData={topicData}
              topicId={topicData.id}
              sessionId={conversation.session?.id}
              onError={(error) => setError(error)}
              cefrLevel={getCurrentLevel()}
            />
          )}

          {/* Text Input */}
          {inputMode === 'text' && (
            <div className="space-y-4">
              <TextInput
                onSubmit={handleTextSubmit}
                placeholder="在这里输入你的英语回答..."
                disabled={isEvaluating}
              />
              {isEvaluating && (
                <div className="text-center text-sm text-gray-600">
                  <span className="animate-spin inline-block mr-2">...</span>
                  评估中...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Previous Attempts Summary */}
        {attempts.length > 0 && (
          <div className="mt-6 bg-white rounded-xl p-4 shadow">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              之前的尝试
            </h3>
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
                    {attempt.text.substring(0, 30)}...
                  </div>
                  <div
                    className={`font-medium ${
                      attempt.overallScore >= 80
                        ? 'text-green-600'
                        : attempt.overallScore >= 60
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {attempt.overallScore}
                  </div>
                  {attempt.audioUrl && (
                    <button
                      onClick={() => playRecording(attempt.audioUrl!)}
                      className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                    >
                      播放
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl">
          <div className="text-sm text-blue-800">
            <strong>提示：</strong>{' '}
            {topicData.type === 'translation'
              ? '自然地表达意思即可，多种正确答案都会被认可！重点是传达相同的意思，不需要逐字翻译。'
              : '大胆发挥！利用建议的词汇和语法来丰富你的表达。没有唯一的正确答案。'}
          </div>
        </div>
      </div>

      {/* Level Change Modal */}
      {pendingDowngrade && (
        <LevelChangeModal
          isOpen={showLevelModal}
          direction="down"
          fromLevel={pendingDowngrade.fromLevel}
          toLevel={pendingDowngrade.toLevel}
          onAccept={handleLevelAccept}
          onDecline={handleLevelDecline}
          onManualSelect={handleManualLevelSelect}
        />
      )}
    </div>
  );
}
