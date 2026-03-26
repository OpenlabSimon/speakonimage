'use client';

import { useState } from 'react';

interface Submission {
  id: string;
  transcribedText: string;
  rawAudioUrl?: string | null;
  evaluation: Record<string, unknown>;
  difficultyAssessment: { overallScore?: number } | null;
  createdAt: string;
  topic: { type: string; originalInput: string } | null;
}

interface RecentActivityProps {
  submissions: Submission[];
}

export function RecentActivity({ submissions }: RecentActivityProps) {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visibleSubmissions = showAll ? submissions : submissions.slice(0, 1);

  const handlePlayUserAudio = async (submission: Submission) => {
    if (!submission.rawAudioUrl) return;

    const audio = new Audio(submission.rawAudioUrl);
    setPlayingAudioId(submission.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    try {
      await audio.play();
    } catch {
      setPlayingAudioId(null);
    }
  };

  if (submissions.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        暂无练习记录
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleSubmissions.map((sub) => {
        const date = new Date(sub.createdAt);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const topicLabel = sub.topic?.originalInput
          ? sub.topic.originalInput.slice(0, 30) + (sub.topic.originalInput.length > 30 ? '...' : '')
          : '未知话题';
        const typeLabel = sub.topic?.type === 'translation' ? '翻译' : '表达';

        return (
          <div key={sub.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {typeLabel}
              </span>
              <span className="text-xs text-gray-500">
                {dateStr} {timeStr}
              </span>
            </div>
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

            {sub.rawAudioUrl && (
              <div className="mt-4 flex">
                <button
                  onClick={() => void handlePlayUserAudio(sub)}
                  className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 sm:w-auto"
                >
                  {playingAudioId === sub.id ? '播放我的录音中...' : '播放我的录音'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {submissions.length > 1 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {showAll ? '收起较早提交' : `展开另外 ${submissions.length - 1} 条提交`}
        </button>
      )}
    </div>
  );
}
