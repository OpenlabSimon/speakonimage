'use client';

interface RecentCoachFeedbackItem {
  id: string;
  content: string;
  createdAt: string;
  source: 'coach_review' | 'evaluation_summary';
  topic: { id?: string; type: string; originalInput: string } | null;
}

interface RecentCoachFeedbackProps {
  feedback: RecentCoachFeedbackItem[];
}

function formatTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RecentCoachFeedback({ feedback }: RecentCoachFeedbackProps) {
  if (feedback.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无老师点评记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => (
        <article key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                {item.source === 'coach_review' ? '老师点评' : '练习总结'}
              </span>
              <span className="text-xs text-gray-500">{formatTime(item.createdAt)}</span>
            </div>
          </div>

          {item.topic?.originalInput && (
            <div className="mt-2 text-xs text-gray-600">
              关联话题：{item.topic.originalInput}
            </div>
          )}

          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-900">
            {item.content}
          </div>
        </article>
      ))}
    </div>
  );
}
