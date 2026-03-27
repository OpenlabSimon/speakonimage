'use client';

import { useState } from 'react';
import { GrowthOverview } from './GrowthOverview';
import { SemanticFeedback } from './SemanticFeedback';
import { GrammarErrors } from './GrammarErrors';
import { Suggestions } from './Suggestions';
import { HistoryComparison } from './HistoryComparison';
import { PracticeGameButton } from './PracticeGameButton';
import { CoachReviewPanel } from './CoachReviewPanel';
import type { DifficultySignal, SameTopicProgress } from '@/domains/runtime/round-orchestrator';
import type { TranslationEvaluationScores, ExpressionEvaluationScores, GrammarErrorItem } from '@/types';
import type { AudioReview, HtmlArtifact, ReviewMode, TeacherSelection } from '@/domains/teachers/types';

type EvaluationData = TranslationEvaluationScores | ExpressionEvaluationScores;

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
}

interface EvaluationResultProps {
  evaluation: EvaluationData;
  userResponse: string;
  attempts?: AttemptData[];
  currentAttempt?: number;
  onRetry: () => void;
  onNext: () => void;
  isNextLoading?: boolean;
  onPracticeGame?: () => void;
  isPracticeGameLoading?: boolean;
  coachReview?: {
    teacher: TeacherSelection;
    reviewMode: ReviewMode;
    autoPlayAudio: boolean;
    reviewText: string;
    speechScript: string;
    audioReview: AudioReview;
    htmlArtifact: HtmlArtifact;
    sameTopicProgress?: SameTopicProgress | null;
    difficultySignal?: DifficultySignal | null;
  };
}

type TabType = 'overview' | 'feedback' | 'grammar' | 'improve' | 'history';

export function EvaluationResult({
  evaluation,
  userResponse,
  attempts = [],
  currentAttempt = 1,
  onRetry,
  onNext,
  isNextLoading = false,
  onPracticeGame,
  isPracticeGameLoading,
  coachReview,
}: EvaluationResultProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Get grammar errors based on type
  const grammarErrors: GrammarErrorItem[] = evaluation.type === 'translation'
    ? evaluation.grammar.errors
    : evaluation.languageQuality.grammarErrors;

  // Define tabs
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: '成长', icon: '🌱' },
    { id: 'feedback', label: '细看', icon: '📝' },
    { id: 'grammar', label: '纠错', icon: '✏️' },
    { id: 'improve', label: '下一步', icon: '💡' },
  ];

  // Add history tab if there are multiple attempts
  if (attempts.length > 1) {
    tabs.push({ id: 'history', label: '历史', icon: '📈' });
  }

  return (
    <>
    {coachReview && (
      <CoachReviewPanel
        teacher={coachReview.teacher}
        reviewMode={coachReview.reviewMode}
        autoPlayAudio={coachReview.autoPlayAudio}
        reviewText={coachReview.reviewText}
        speechScript={coachReview.speechScript}
        audioReview={coachReview.audioReview}
        htmlArtifact={coachReview.htmlArtifact}
        sameTopicProgress={coachReview.sameTopicProgress}
        difficultySignal={coachReview.difficultySignal}
        onRetry={onRetry}
      />
    )}
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* User Response Summary */}
      <div className="bg-gray-50 px-4 py-3 border-b">
        <div className="text-xs text-gray-500 mb-1">你的回答:</div>
        <div className="text-gray-800 text-sm line-clamp-2">{userResponse}</div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b overflow-x-auto">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`min-h-11 flex-1 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors min-w-[88px] ${
              activeTab === id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="mr-1">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {activeTab === 'overview' && (
          <GrowthOverview
            evaluation={evaluation}
            sameTopicProgress={coachReview?.sameTopicProgress}
            difficultySignal={coachReview?.difficultySignal}
          />
        )}

        {activeTab === 'feedback' && (
          <SemanticFeedback evaluation={evaluation} />
        )}

        {activeTab === 'grammar' && (
          <GrammarErrors errors={grammarErrors} />
        )}

        {activeTab === 'improve' && (
          <Suggestions
            betterExpressions={evaluation.betterExpressions}
            suggestions={evaluation.suggestions}
          />
        )}

        {activeTab === 'history' && attempts.length > 1 && (
          <HistoryComparison attempts={attempts} currentAttempt={currentAttempt} />
        )}
      </div>

      {/* Action Buttons */}
      <div className="sticky bottom-0 z-10 space-y-3 border-t bg-gray-50/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-gray-50/85">
        {onPracticeGame && (
          <PracticeGameButton onClick={onPracticeGame} isLoading={isPracticeGameLoading} />
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onRetry}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <span>🔄</span>
            再试一次
          </button>
          <button
            onClick={onNext}
            disabled={isNextLoading}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            <span>➡️</span>
            {isNextLoading ? '准备下一题...' : '练这题'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
