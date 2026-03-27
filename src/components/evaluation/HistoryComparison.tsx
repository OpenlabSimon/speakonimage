'use client';

interface AttemptData {
  attemptNumber: number;
  text: string;
  overallScore: number;
  timestamp: string;
}

interface HistoryComparisonProps {
  attempts: AttemptData[];
  currentAttempt: number;
}

export function HistoryComparison({ attempts, currentAttempt }: HistoryComparisonProps) {
  if (attempts.length <= 1) {
    return null;
  }

  const previousAttempt = attempts.find(a => a.attemptNumber === currentAttempt - 1);

  const getTrendIcon = () => {
    if (!previousAttempt) return { icon: '➡️', text: '从这一版开始建立自己的练习轨迹', color: 'text-yellow-600' };
    return { icon: '🔁', text: '把这一版和上一版放在一起看，重点是有没有修掉刚才的问题', color: 'text-green-600' };
  };

  const trend = getTrendIcon();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">你的进步</h3>
      </div>

      <div className="p-4">
        {/* Score comparison */}
        {previousAttempt && (
          <div className="mb-4 flex flex-col items-center justify-center gap-3 rounded-lg bg-gray-50 py-3 sm:flex-row sm:gap-4">
            <div className="text-center">
              <div className="text-xs text-gray-500">上一版</div>
              <div className="text-base font-semibold text-gray-500">第 {previousAttempt.attemptNumber} 次</div>
            </div>
            <div className="text-2xl">{trend.icon}</div>
            <div className="text-center">
              <div className="text-xs text-gray-500">这一版</div>
              <div className="text-base font-semibold text-blue-600">第 {currentAttempt} 次</div>
            </div>
          </div>
        )}

        <div className={`text-center text-sm font-medium ${trend.color} mb-4`}>
          {trend.text}
        </div>

        {/* History timeline */}
        <div className="space-y-2">
          <div className="text-xs text-gray-500 mb-2">所有尝试:</div>
          {attempts.slice().reverse().map((attempt) => (
            <div
              key={attempt.attemptNumber}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                attempt.attemptNumber === currentAttempt
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-gray-50'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                attempt.attemptNumber === currentAttempt
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                {attempt.attemptNumber}
              </div>
              <div className="flex-1 text-sm text-gray-600 truncate">
                {attempt.text.substring(0, 50)}...
              </div>
              <div className={`text-xs font-medium ${
                attempt.attemptNumber === currentAttempt ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {attempt.attemptNumber === currentAttempt ? '当前版本' : '历史版本'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
