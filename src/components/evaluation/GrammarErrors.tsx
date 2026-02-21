'use client';

import type { GrammarErrorItem } from '@/types';

interface GrammarErrorsProps {
  errors: GrammarErrorItem[];
}

export function GrammarErrors({ errors }: GrammarErrorsProps) {
  if (errors.length === 0) {
    return (
      <div className="bg-green-50 rounded-xl p-4 text-center">
        <div className="text-2xl mb-2">🎉</div>
        <div className="text-green-700 font-medium">没有语法错误！</div>
        <div className="text-green-600 text-sm">你的语法很棒。</div>
      </div>
    );
  }

  const getSeverityStyle = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-orange-50 border-orange-200';
    }
  };

  const getSeverityLabel = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return { text: '严重', color: 'text-red-600 bg-red-100' };
      case 'medium':
        return { text: '轻微', color: 'text-yellow-700 bg-yellow-100' };
      default:
        return { text: '建议', color: 'text-orange-600 bg-orange-100' };
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">语法纠正</h3>
        <span className="text-sm text-gray-500">
          {errors.length} 个问题
        </span>
      </div>

      {errors.map((error, index) => {
        const severity = getSeverityLabel(error.severity);
        return (
          <div
            key={index}
            className={`rounded-xl border p-4 ${getSeverityStyle(error.severity)}`}
          >
            {/* Severity badge */}
            <div className="mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${severity.color}`}>
                {severity.text}
              </span>
            </div>

            {/* Error correction */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-0.5">你的原文:</div>
                <div className="text-red-600 line-through">{error.original}</div>
              </div>
              <div className="text-gray-400 text-xl">→</div>
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-0.5">正确:</div>
                <div className="text-green-600 font-medium">{error.corrected}</div>
              </div>
            </div>

            {/* Rule explanation */}
            <div className="bg-white/50 rounded-lg px-3 py-2 mt-2">
              <div className="text-xs text-gray-500 mb-0.5">语法规则:</div>
              <div className="text-sm text-gray-700">{error.rule}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
