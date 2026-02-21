'use client';

import type { TranslationEvaluationScores, ExpressionEvaluationScores } from '@/types';

type EvaluationData = TranslationEvaluationScores | ExpressionEvaluationScores;

interface ScoreOverviewProps {
  evaluation: EvaluationData;
  overallScore: number;
}

export function ScoreOverview({ evaluation, overallScore }: ScoreOverviewProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-50';
    if (score >= 60) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getGrade = (score: number) => {
    if (score >= 90) return { grade: 'A', emoji: '🌟' };
    if (score >= 80) return { grade: 'B', emoji: '👍' };
    if (score >= 70) return { grade: 'C', emoji: '💪' };
    if (score >= 60) return { grade: 'D', emoji: '📚' };
    return { grade: 'F', emoji: '🔄' };
  };

  const { grade, emoji } = getGrade(overallScore);

  const scores = evaluation.type === 'translation'
    ? [
        {
          label: '语义准确度',
          score: evaluation.semanticAccuracy.score,
          description: '是否准确传达了原意？'
        },
        {
          label: '自然度',
          score: evaluation.naturalness.score,
          description: '表达是否自然地道？'
        },
        {
          label: '语法',
          score: evaluation.grammar.score,
          description: '语法是否正确？'
        },
        {
          label: '词汇',
          score: evaluation.vocabulary.score,
          description: '用词是否恰当？'
        },
      ]
    : [
        {
          label: '相关性',
          score: evaluation.relevance.score,
          description: '是否紧扣话题？'
        },
        {
          label: '丰富度',
          score: evaluation.depth.score,
          description: '内容是否充实？'
        },
        {
          label: '创意度',
          score: evaluation.creativity.score,
          description: '表达是否有创意？'
        },
        {
          label: '语言质量',
          score: evaluation.languageQuality.score,
          description: '语法和用词质量'
        },
      ];

  return (
    <div className="space-y-6">
      {/* Overall Score Circle */}
      <div className={`text-center p-6 rounded-2xl ${getScoreBgColor(overallScore)}`}>
        <div className="text-5xl mb-1">{emoji}</div>
        <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
          {overallScore}
        </div>
        <div className={`text-2xl font-semibold ${getScoreColor(overallScore)} mt-1`}>
          {grade} 级
        </div>
        <div className="text-sm text-gray-500 mt-2">
          CEFR等级: <span className="font-semibold">{evaluation.overallCefrEstimate}</span>
        </div>
      </div>

      {/* Individual Scores */}
      <div className="space-y-3">
        {scores.map(({ label, score, description }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-3">
            <div className="flex justify-between items-center mb-1">
              <div>
                <span className="font-medium text-gray-800">{label}</span>
              </div>
              <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getScoreBarColor(score)} transition-all duration-700 ease-out`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">{description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
