'use client';

import { useState } from 'react';
import type {
  CoachMemoryProfile,
  InterestSignal,
  GoalSignal,
  EntitySignal,
  MemorySnippet,
} from '@/lib/profile/memory';

interface LearnerMemoryProps {
  interests: InterestSignal[];
  goals: GoalSignal[];
  entities: EntitySignal[];
  memorySnippets: MemorySnippet[];
  coachMemory?: CoachMemoryProfile;
  onSaveInterests?: (labels: string[]) => Promise<void>;
  isSavingInterests?: boolean;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LearnerMemory({
  interests,
  goals,
  entities,
  memorySnippets,
  coachMemory,
  onSaveInterests,
  isSavingInterests = false,
}: LearnerMemoryProps) {
  const [draftInterests, setDraftInterests] = useState<string[]>(interests.map((item) => item.label));
  const [newInterest, setNewInterest] = useState('');
  const [showAllMemories, setShowAllMemories] = useState(false);
  const visibleMemories = showAllMemories ? memorySnippets : memorySnippets.slice(0, 1);

  function removeInterest(label: string) {
    setDraftInterests((current) => current.filter((item) => item !== label));
  }

  function addInterest() {
    const next = newInterest.trim();
    if (!next) return;
    setDraftInterests((current) => {
      if (current.includes(next)) return current;
      return [...current, next].slice(0, 8);
    });
    setNewInterest('');
  }

  if (
    interests.length === 0 &&
    goals.length === 0 &&
    entities.length === 0 &&
    memorySnippets.length === 0 &&
    !coachMemory?.longTermReminders.length &&
    !coachMemory?.currentRoundReminders.length &&
    !onSaveInterests
  ) {
    return (
      <div className="text-center py-4 text-sm text-gray-500">
        暂时还没有形成稳定记忆，多练几轮后这里会开始懂你在乎什么。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(interests.length > 0 || onSaveInterests) && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-gray-500">你最近最关注的话题</div>
            {onSaveInterests && (
              <button
                type="button"
                onClick={() => {
                  void onSaveInterests(draftInterests);
                }}
                disabled={isSavingInterests}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSavingInterests ? '保存中...' : '保存修正'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(onSaveInterests ? draftInterests : interests.map((item) => item.label)).map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                <span>{label}</span>
                {onSaveInterests && (
                  <button
                    type="button"
                    onClick={() => removeInterest(label)}
                    className="text-blue-500 hover:text-blue-700"
                    aria-label={`删除 ${label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {onSaveInterests && (
            <div className="mt-3 flex gap-2">
              <input
                value={newInterest}
                onChange={(event) => setNewInterest(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addInterest();
                  }
                }}
                placeholder="添加你真正关心的话题"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={addInterest}
                disabled={!newInterest.trim()}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                添加
              </button>
            </div>
          )}
          {onSaveInterests && (
            <div className="mt-2 text-xs text-gray-400">
              删除错记的话题后，系统会尽量不再把它当成你的核心兴趣。
            </div>
          )}
        </div>
      )}

      {goals.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">当前优先突破</div>
          <div className="flex flex-wrap gap-2">
            {goals.map((goal) => (
              <span
                key={goal.key}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
              >
                {goal.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {entities.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">你反复提到的对象</div>
          <div className="flex flex-wrap gap-2">
            {entities.map((entity) => (
              <span
                key={entity.key}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {entity.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {memorySnippets.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-gray-500">最近被记住的表达与点评</div>
          {visibleMemories.map((memory) => (
            <article key={memory.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    memory.kind === 'user_output'
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {memory.kind === 'user_output' ? '用户输出' : '老师点评'}
                </span>
                <span className="text-xs text-gray-400">{formatTime(memory.createdAt)}</span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                {memory.summary}
              </div>
              {memory.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {memory.tags.map((tag) => (
                    <span key={`${memory.id}-${tag}`} className="text-xs text-gray-500">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {memorySnippets.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllMemories((current) => !current)}
              className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {showAllMemories ? '收起较早记忆' : `展开另外 ${memorySnippets.length - 1} 条记忆`}
            </button>
          )}
        </div>
      )}

      {coachMemory && (
        <div className="space-y-4">
          {coachMemory.longTermReminders.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500">老师长期提醒</div>
              <div className="space-y-2">
                {coachMemory.longTermReminders.map((reminder) => (
                  <div key={reminder.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {reminder.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {coachMemory.currentRoundReminders.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500">本轮老师提醒</div>
              <div className="space-y-2">
                {coachMemory.currentRoundReminders.map((reminder) => (
                  <div key={reminder.id} className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                    {reminder.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
