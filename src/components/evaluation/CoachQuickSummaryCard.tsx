'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CHARACTER_LIST, getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';
import { REVIEW_MODE_OPTIONS } from '@/domains/teachers/character-bridge';
import type { ReviewMode } from '@/domains/teachers/types';

interface CoachQuickSummaryCardProps {
  characterId: TeacherCharacterId;
  reviewMode: ReviewMode;
  autoPlayAudio: boolean;
  voiceId: string;
  isRemoteBacked: boolean;
  onReviewModeChange?: (mode: ReviewMode) => void;
  onAutoPlayAudioChange?: (enabled: boolean) => void;
  onCharacterChange?: (id: TeacherCharacterId) => void;
  onVoiceIdChange?: (voiceId: string) => void;
}

export function CoachQuickSummaryCard({
  characterId,
  reviewMode,
  autoPlayAudio,
  voiceId,
  isRemoteBacked,
  onReviewModeChange,
  onAutoPlayAudioChange,
  onCharacterChange,
  onVoiceIdChange,
}: CoachQuickSummaryCardProps) {
  const character = getCharacter(characterId);
  const [isExpanded, setIsExpanded] = useState(false);
  const reviewModeLabel =
    REVIEW_MODE_OPTIONS.find((option) => option.id === reviewMode)?.label || reviewMode;
  const effectiveVoiceId = voiceId || character.voiceConfig.voiceId;
  const hasControls =
    Boolean(onReviewModeChange) ||
    Boolean(onAutoPlayAudioChange) ||
    Boolean(onCharacterChange) ||
    Boolean(onVoiceIdChange);

  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-lg sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-gray-400 mb-2">
            Current Coach
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-xl">
              {character.emoji}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {character.name}
              </div>
              <div className="text-xs text-gray-500">
                {character.tagline}
              </div>
            </div>
          </div>
        </div>

        <Link
          href="/profile"
          className="min-h-11 w-full rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 sm:w-auto shrink-0"
        >
          调整设置
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
          输出: {reviewModeLabel}
        </span>
        <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
          {autoPlayAudio ? '自动播放开启' : '手动播放'}
        </span>
        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
          声音: {voiceId ? '自定义' : '默认'}
        </span>
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
          {isRemoteBacked ? '已同步到账户' : '仅当前浏览器'}
        </span>
      </div>

      {hasControls && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100"
            aria-expanded={isExpanded}
          >
            <div>
              <div className="text-sm font-medium text-gray-700">
                快捷控制
              </div>
              <div className="text-xs text-gray-500">
                {isExpanded ? '收起老师与输出快捷设置' : '展开老师与输出快捷设置'}
              </div>
            </div>
            <span className="text-sm text-gray-500">
              {isExpanded ? '收起' : '展开'}
            </span>
          </button>
        </div>
      )}

      {isExpanded && onReviewModeChange && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-[0.14em] text-gray-400 mb-2">
            Quick Switch
          </div>
          <div className="flex flex-wrap gap-2">
            {REVIEW_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => onReviewModeChange(option.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  reviewMode === option.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isExpanded && onCharacterChange && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-[0.14em] text-gray-400 mb-2">
            Quick Teacher
          </div>
          <div className="flex flex-wrap gap-2">
            {CHARACTER_LIST.map((item) => (
              <button
                key={item.id}
                onClick={() => onCharacterChange(item.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  characterId === item.id
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                {item.emoji} {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isExpanded && onAutoPlayAudioChange && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2">
          <div>
            <div className="text-sm font-medium text-gray-700">
              自动播放老师语音
            </div>
            <div className="text-xs text-gray-500">
              开始练习前先决定是否自动播报点评
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAutoPlayAudioChange(!autoPlayAudio)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              autoPlayAudio ? 'bg-amber-500' : 'bg-gray-300'
            }`}
            aria-pressed={autoPlayAudio}
            aria-label="切换自动播放老师语音"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                autoPlayAudio ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {isExpanded && onVoiceIdChange && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-[0.14em] text-gray-400 mb-2">
            Quick Voice
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onVoiceIdChange('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                !voiceId
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              默认声音
            </button>
            {CHARACTER_LIST.map((item) => (
              <button
                key={`${item.id}-voice`}
                type="button"
                onClick={() => onVoiceIdChange(item.voiceConfig.voiceId)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  effectiveVoiceId === item.voiceConfig.voiceId
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {item.emoji} {item.name} 音色
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            当前 Azure voice: {effectiveVoiceId}
          </div>
        </div>
      )}
    </div>
  );
}
