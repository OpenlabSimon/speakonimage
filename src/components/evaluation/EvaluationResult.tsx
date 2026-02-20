'use client';

import { useState } from 'react';
import { ScoreOverview } from './ScoreOverview';
import { SemanticFeedback } from './SemanticFeedback';
import { GrammarErrors } from './GrammarErrors';
import { Suggestions } from './Suggestions';
import { HistoryComparison } from './HistoryComparison';
import type { TranslationEvaluationScores, ExpressionEvaluationScores, GrammarErrorItem } from '@/types';

type EvaluationData = TranslationEvaluationScores | ExpressionEvaluationScores;

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
}

interface EvaluationResultProps {
  evaluation: EvaluationData;
  overallScore: number;
  userResponse: string;
  attempts?: AttemptData[];
  currentAttempt?: number;
  onRetry: () => void;
  onNext: () => void;
}

type TabType = 'overview' | 'feedback' | 'grammar' | 'improve' | 'history';

export function EvaluationResult({
  evaluation,
  overallScore,
  userResponse,
  attempts = [],
  currentAttempt = 1,
  onRetry,
  onNext,
}: EvaluationResultProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Get grammar errors based on type
  const grammarErrors: GrammarErrorItem[] = evaluation.type === 'translation'
    ? evaluation.grammar.errors
    : evaluation.languageQuality.grammarErrors;

  // Define tabs
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Score', icon: '📊' },
    { id: 'feedback', label: 'Details', icon: '📝' },
    { id: 'grammar', label: 'Grammar', icon: '✏️' },
    { id: 'improve', label: 'Improve', icon: '💡' },
  ];

  // Add history tab if there are multiple attempts
  if (attempts.length > 1) {
    tabs.push({ id: 'history', label: 'History', icon: '📈' });
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* User Response Summary */}
      <div className="bg-gray-50 px-4 py-3 border-b">
        <div className="text-xs text-gray-500 mb-1">Your response:</div>
        <div className="text-gray-800 text-sm line-clamp-2">{userResponse}</div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b overflow-x-auto">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 min-w-[80px] py-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${
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
          <ScoreOverview evaluation={evaluation} overallScore={overallScore} />
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
      <div className="p-4 bg-gray-50 border-t flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <span>🔄</span>
          Try Again
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <span>➡️</span>
          Next Topic
        </button>
      </div>
    </div>
  );
}
