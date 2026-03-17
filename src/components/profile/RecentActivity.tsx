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
          <div key={sub.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                  {typeLabel}
                </span>
                <span className="text-xs text-gray-500">
                  {dateStr} {timeStr}
                </span>
              </div>
              {score != null && (
                <span className={`text-sm font-semibold ${
                  score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-500'
                }`}>
                  {score}
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500">题目</div>
              <div className="mt-1 text-sm text-gray-800 break-words">{topicLabel}</div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500">本次提交</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-900">
                {sub.transcribedText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
