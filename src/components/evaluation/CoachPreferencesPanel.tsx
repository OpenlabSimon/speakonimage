'use client';

import { useEffect, useMemo, useState } from 'react';
import { CharacterSelector } from './CharacterSelector';
import { CHARACTER_LIST, getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';
import { REVIEW_MODE_OPTIONS } from '@/domains/teachers/character-bridge';
import type { ReviewMode } from '@/domains/teachers/types';

const AZURE_VOICE_NAME_PATTERN = /^[a-z]{2,3}-[A-Z]{2,}-[A-Za-z0-9]+Neural$/;
const LEGACY_ELEVENLABS_VOICE_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

interface CoachPreferencesPanelProps {
  characterId: TeacherCharacterId;
  onCharacterChange: (id: TeacherCharacterId) => void;
  reviewMode: ReviewMode;
  onReviewModeChange: (mode: ReviewMode) => void;
  autoPlayAudio: boolean;
  onAutoPlayAudioChange: (enabled: boolean) => void;
  voiceId: string;
  onVoiceIdChange: (voiceId: string) => void;
  isRemoteBacked: boolean;
  defaultExpanded?: boolean;
}

export function CoachPreferencesPanel({
  characterId,
  onCharacterChange,
  reviewMode,
  onReviewModeChange,
  autoPlayAudio,
  onAutoPlayAudioChange,
  voiceId,
  onVoiceIdChange,
  isRemoteBacked,
  defaultExpanded = false,
}: CoachPreferencesPanelProps) {
  const selectedCharacter = getCharacter(characterId);
  const [voiceIdDraft, setVoiceIdDraft] = useState(voiceId);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setVoiceIdDraft(voiceId);
  }, [voiceId]);

  const normalizedDraft = voiceIdDraft.trim();
  const isVoiceIdValid =
    normalizedDraft.length === 0 ||
    AZURE_VOICE_NAME_PATTERN.test(normalizedDraft) ||
    LEGACY_ELEVENLABS_VOICE_ID_PATTERN.test(normalizedDraft);
  const hasPendingVoiceIdChange = normalizedDraft !== voiceId;
  const voicePresets = useMemo(
    () =>
      CHARACTER_LIST.map((character) => ({
        id: character.id,
        label: character.name,
        voiceId: character.voiceConfig.voiceId,
      })),
    []
  );

  const applyVoiceId = () => {
    if (!isVoiceIdValid) return;
    onVoiceIdChange(normalizedDraft);
  };

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-medium text-gray-700">老师与输出设置</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
              {selectedCharacter.emoji} {selectedCharacter.name}
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
              输出: {REVIEW_MODE_OPTIONS.find((option) => option.id === reviewMode)?.label || reviewMode}
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
              {autoPlayAudio ? '自动播放开启' : '手动播放'}
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              声音: {voiceId ? '自定义' : '默认'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="min-h-11 w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 shrink-0 sm:w-auto"
          aria-expanded={isExpanded}
        >
          {isExpanded ? '收起' : '展开'}
        </button>
      </div>

      {isExpanded && (
        <>
          <div className="mt-4">
            <CharacterSelector selectedId={characterId} onSelect={onCharacterChange} />
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-[0.14em] text-gray-400 mb-2">
              Review Mode
            </div>
            <div className="flex flex-wrap gap-2">
              {REVIEW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onReviewModeChange(option.id)}
                  className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    reviewMode === option.id
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoPlayAudio}
              onChange={(event) => onAutoPlayAudioChange(event.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
            自动播放老师语音
          </label>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-xs uppercase tracking-[0.14em] text-gray-400">
                Azure Voice
              </label>
              <button
                type="button"
                onClick={() => {
                  setVoiceIdDraft('');
                  onVoiceIdChange('');
                }}
                disabled={!voiceId && normalizedDraft.length === 0}
                className={`text-xs font-medium transition-colors ${
                  voiceId || normalizedDraft.length > 0
                    ? 'text-amber-600 hover:text-amber-700'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
              >
                恢复默认声音
              </button>
            </div>
            <input
              type="text"
              value={voiceIdDraft}
              onChange={(event) => setVoiceIdDraft(event.target.value)}
              onBlur={applyVoiceId}
              placeholder={`留空则使用 ${selectedCharacter.name} 默认 Azure 音色`}
              className={`w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                isVoiceIdValid
                  ? 'border border-gray-300 focus:border-amber-500 focus:ring-amber-100'
                  : 'border border-red-300 focus:border-red-400 focus:ring-red-100'
              }`}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {voicePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setVoiceIdDraft(preset.voiceId);
                    onVoiceIdChange(preset.voiceId);
                  }}
                  className={`min-h-11 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    (voiceId || normalizedDraft) === preset.voiceId
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={applyVoiceId}
                disabled={!hasPendingVoiceIdChange || !isVoiceIdValid}
                className={`min-h-11 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  hasPendingVoiceIdChange && isVoiceIdValid
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                应用音色
              </button>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              当前默认 Azure voice: {selectedCharacter.voiceConfig.voiceId}
            </div>
            {!isVoiceIdValid && (
              <div className="mt-1 text-xs text-red-600">
                推荐填写 Azure voice 名称，例如 en-US-JennyNeural。旧的 20 位 voiceId 也可保留，但运行时会回退到默认 Azure 音色。
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-3 text-xs text-gray-500">
        {isRemoteBacked
          ? '这些老师与输出偏好会自动同步到账户。'
          : '这些老师与输出偏好会自动保存在当前浏览器。'}
      </div>
    </div>
  );
}
