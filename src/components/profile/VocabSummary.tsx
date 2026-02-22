'use client';

interface VocabSummaryProps {
  vocab: {
    uniqueWordCount: number;
    cefrDistribution: Record<string, number>;
    weakWords: { word: string; incorrect: number; correct: number }[];
  };
}

const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function VocabSummary({ vocab }: VocabSummaryProps) {
  const totalDistributed = Object.values(vocab.cefrDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Total words */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">已学词汇</span>
        <span className="text-lg font-bold text-blue-600">{vocab.uniqueWordCount}</span>
      </div>

      {/* CEFR distribution */}
      {totalDistributed > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2">词汇等级分布</div>
          <div className="flex gap-1 h-6">
            {cefrOrder.map((level) => {
              const count = vocab.cefrDistribution[level] || 0;
              if (count === 0) return null;
              const pct = Math.max((count / totalDistributed) * 100, 8);
              return (
                <div
                  key={level}
                  className="bg-blue-100 rounded text-center text-xs leading-6 text-blue-700 font-medium"
                  style={{ width: `${pct}%` }}
                  title={`${level}: ${count}`}
                >
                  {level}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weak words */}
      {vocab.weakWords.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2">薄弱词汇 (错误 &gt; 正确)</div>
          <div className="flex flex-wrap gap-2">
            {vocab.weakWords.map((w) => (
              <span
                key={w.word}
                className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs"
                title={`正确${w.correct}次 / 错误${w.incorrect}次`}
              >
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}

      {vocab.uniqueWordCount === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          暂无词汇记录，开始练习来积累词汇
        </div>
      )}
    </div>
  );
}
