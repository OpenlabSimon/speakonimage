'use client';

interface Submission {
  id: string;
  transcribedText: string;
  evaluation: Record<string, unknown>;
  difficultyAssessment: { overallScore?: number } | null;
  createdAt: string;
  topic: { type: string; originalInput: string } | null;
}

interface RecentActivityProps {
  submissions: Submission[];
}

export function RecentActivity({ submissions }: RecentActivityProps) {
  if (submissions.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无练习记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((sub) => {
        const score = sub.difficultyAssessment?.overallScore;
        const date = new Date(sub.createdAt);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const topicLabel = sub.topic?.originalInput
          ? sub.topic.originalInput.slice(0, 30) + (sub.topic.originalInput.length > 30 ? '...' : '')
          : '未知话题';
        const typeLabel = sub.topic?.type === 'translation' ? '翻译' : '表达';

        return (
          <div key={sub.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                  {typeLabel}
                </span>
                <span className="text-sm text-gray-800 truncate">{topicLabel}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">
                {sub.transcribedText.slice(0, 50)}
                {sub.transcribedText.length > 50 ? '...' : ''}
              </div>
            </div>
            <div className="flex items-center gap-3 ml-3 shrink-0">
              {score != null && (
                <span className={`text-sm font-semibold ${
                  score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-500'
                }`}>
                  {score}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {dateStr} {timeStr}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
