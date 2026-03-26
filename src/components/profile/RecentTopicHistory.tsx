'use client';

import Link from 'next/link';
import { useState } from 'react';

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
  const [showAll, setShowAll] = useState(false);
  if (topics.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无可继续优化的历史输入
      </div>
    );
  }

  const visibleTopics = showAll ? topics : topics.slice(0, 2);

  return (
    <div className="space-y-3">
      {visibleTopics.map((topic) => {
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

            <div className="mt-4 flex justify-end">
              <Link
                href={`/topic/practice?topicId=${topic.id}`}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                继续学习
              </Link>
            </div>
          </article>
        );
      })}
      {topics.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {showAll ? '收起较早话题' : `展开另外 ${topics.length - 2} 个话题`}
        </button>
      )}
    </div>
  );
}
