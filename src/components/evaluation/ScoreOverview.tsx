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
          label: 'Semantic Accuracy',
          labelCn: '语义准确度',
          score: evaluation.semanticAccuracy.score,
          description: 'Did you convey the meaning?'
        },
        {
          label: 'Naturalness',
          labelCn: '自然度',
          score: evaluation.naturalness.score,
          description: 'Does it sound natural?'
        },
        {
          label: 'Grammar',
          labelCn: '语法',
          score: evaluation.grammar.score,
          description: 'Grammar accuracy'
        },
        {
          label: 'Vocabulary',
          labelCn: '词汇',
          score: evaluation.vocabulary.score,
          description: 'Word choices'
        },
      ]
    : [
        {
          label: 'Relevance',
          labelCn: '相关性',
          score: evaluation.relevance.score,
          description: 'On topic?'
        },
        {
          label: 'Depth',
          labelCn: '深度',
          score: evaluation.depth.score,
          description: 'Rich content?'
        },
        {
          label: 'Creativity',
          labelCn: '创意',
          score: evaluation.creativity.score,
          description: 'Original expression?'
        },
        {
          label: 'Language',
          labelCn: '语言质量',
          score: evaluation.languageQuality.score,
          description: 'Grammar & vocab'
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
          Grade {grade}
        </div>
        <div className="text-sm text-gray-500 mt-2">
          CEFR Level: <span className="font-semibold">{evaluation.overallCefrEstimate}</span>
        </div>
      </div>

      {/* Individual Scores */}
      <div className="space-y-3">
        {scores.map(({ label, labelCn, score, description }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-3">
            <div className="flex justify-between items-center mb-1">
              <div>
                <span className="font-medium text-gray-800">{label}</span>
                <span className="text-xs text-gray-400 ml-2">{labelCn}</span>
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
