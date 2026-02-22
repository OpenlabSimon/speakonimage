'use client';

interface GrammarError {
  pattern: string;
  count: number;
  originalText?: string;
  correctedText?: string;
  trend: 'improving' | 'stable' | 'increasing';
}

interface GrammarErrorListProps {
  errors: GrammarError[];
}

const trendLabels: Record<string, { text: string; color: string }> = {
  improving: { text: '改善中', color: 'text-green-600' },
  stable: { text: '稳定', color: 'text-gray-500' },
  increasing: { text: '增加中', color: 'text-red-500' },
};

export function GrammarErrorList({ errors }: GrammarErrorListProps) {
  if (errors.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无语法错误记录，继续练习即可生成分析
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errors.map((err) => {
        const trend = trendLabels[err.trend] || trendLabels.stable;
        return (
          <div key={err.pattern} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-800 text-sm">{err.pattern}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{err.count}次</span>
                <span className={`text-xs ${trend.color}`}>{trend.text}</span>
              </div>
            </div>
            {err.originalText && err.correctedText && (
              <div className="text-xs mt-1 space-y-0.5">
                <div className="text-red-400 line-through">{err.originalText}</div>
                <div className="text-green-600">{err.correctedText}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
