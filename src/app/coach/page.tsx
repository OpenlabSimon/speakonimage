'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { CoachPreferencesPanel } from '@/components/evaluation/CoachPreferencesPanel';
import { useCoachPreferences } from '@/hooks/useCoachPreferences';
import { useLevelHistory } from '@/hooks/useLevelHistory';
import { getCharacter } from '@/lib/characters';

export default function CoachPage() {
  const {
    characterId,
    setCharacterId,
    reviewMode,
    setReviewMode,
    autoPlayAudio,
    setAutoPlayAudio,
    voiceId,
    setVoiceId,
    isRemoteBacked,
  } = useCoachPreferences();
  const { history } = useLevelHistory();
  const currentCharacter = getCharacter(characterId);

  return (
    <AppShell
      activeNav="coach"
      title="Coach"
      description="把老师人设、声音和点评方式单独放在这里，避免在聊天和回顾流程里频繁切换设置。"
      headerActions={(
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            返回 Chat
          </Link>
          <Link
            href="/profile"
            className="min-h-11 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            去 Review
          </Link>
        </div>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              Current coach
            </div>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
                  {currentCharacter.emoji}
                </div>
                <div>
                  <div className="text-xl font-semibold text-slate-950">
                    {currentCharacter.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {currentCharacter.tagline}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    当前会影响实时对话里的老师语气、最终点评口吻，以及默认语音。
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <CoachPreferencesPanel
                characterId={characterId}
                onCharacterChange={setCharacterId}
                reviewMode={reviewMode}
                onReviewModeChange={setReviewMode}
                autoPlayAudio={autoPlayAudio}
                onAutoPlayAudioChange={setAutoPlayAudio}
                voiceId={voiceId}
                onVoiceIdChange={setVoiceId}
                isRemoteBacked={isRemoteBacked}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              Defaults
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">当前等级</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {history?.currentLevel || 'B1'}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  这是聊天和题目默认参考等级。
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">当前主模式</div>
                <div className="mt-2 text-base font-semibold text-slate-950">
                  Chat-first
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  默认先进入实时对话，再去 Review 看最终点评。
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="text-sm font-semibold text-slate-900">
              下一步怎么用
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
              <p>1. 先在这里选一个老师风格和声音。</p>
              <p>2. 回到 Chat 或 Practice 开始练。</p>
              <p>3. 结束后去 Review 看这轮最终点评。</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
