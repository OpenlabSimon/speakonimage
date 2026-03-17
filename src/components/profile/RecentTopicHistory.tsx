'use client';

interface RecentTopic {
  id: string;
  type: string;
  originalInput: string;
  createdAt: string;
  submissionCount: number;
  latestDraft: string | null;
  draftCount: number;
}

interface RecentTopicHistoryProps {
  topics: RecentTopic[];
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

export function RecentTopicHistory({ topics }: RecentTopicHistoryProps) {
  if (topics.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无可继续优化的历史输入
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topics.map((topic) => {
        const typeLabel = topic.type === 'translation' ? '翻译' : '表达';
        const latestText = topic.latestDraft?.trim() || topic.originalInput;

        return (
          <article key={topic.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {typeLabel}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(topic.createdAt)}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {topic.draftCount > 0 ? `${topic.draftCount} 版草稿` : '原始输入'}
                {' · '}
                {topic.submissionCount} 次提交
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500">题目</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                {topic.originalInput}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-gray-500">最近一次输入</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-900">
                {latestText}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
