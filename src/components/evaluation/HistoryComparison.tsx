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

  const currentScore = attempts.find(a => a.attemptNumber === currentAttempt)?.overallScore || 0;
  const previousAttempt = attempts.find(a => a.attemptNumber === currentAttempt - 1);

  const scoreDiff = previousAttempt ? currentScore - previousAttempt.overallScore : 0;

  const getTrendIcon = () => {
    if (scoreDiff > 5) return { icon: '📈', text: 'Great improvement!', color: 'text-green-600' };
    if (scoreDiff > 0) return { icon: '↗️', text: 'Getting better!', color: 'text-green-600' };
    if (scoreDiff === 0) return { icon: '➡️', text: 'Same level', color: 'text-yellow-600' };
    if (scoreDiff > -5) return { icon: '↘️', text: 'Slight dip', color: 'text-orange-600' };
    return { icon: '📉', text: 'Keep trying!', color: 'text-red-600' };
  };

  const trend = getTrendIcon();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">Your Progress</h3>
      </div>

      <div className="p-4">
        {/* Score comparison */}
        {previousAttempt && (
          <div className="flex items-center justify-center gap-4 mb-4 py-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-xs text-gray-500">Previous</div>
              <div className="text-2xl font-bold text-gray-400">{previousAttempt.overallScore}</div>
            </div>
            <div className="text-2xl">{trend.icon}</div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Now</div>
              <div className="text-2xl font-bold text-blue-600">{currentScore}</div>
            </div>
            <div className={`text-sm font-medium ${trend.color}`}>
              {scoreDiff > 0 && '+'}
              {scoreDiff}
            </div>
          </div>
        )}

        <div className={`text-center text-sm font-medium ${trend.color} mb-4`}>
          {trend.text}
        </div>

        {/* History timeline */}
        <div className="space-y-2">
          <div className="text-xs text-gray-500 mb-2">All attempts:</div>
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
    </div>
  );
}
