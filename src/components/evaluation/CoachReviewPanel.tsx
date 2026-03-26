'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LessonArtifactOverlay } from './LessonArtifactOverlay';
import { getApiErrorMessage, parseJsonResponse } from '@/lib/http/parse-json-response';
import type { DifficultySignal, SameTopicProgress } from '@/domains/runtime/round-orchestrator';
import type { AudioReview, HtmlArtifact, ReviewMode, TeacherSelection } from '@/domains/teachers/types';

interface CoachReviewPanelProps {
  teacher: TeacherSelection;
  reviewMode: ReviewMode;
  autoPlayAudio: boolean;
  reviewText: string;
  speechScript: string;
  audioReview: AudioReview;
  htmlArtifact: HtmlArtifact;
  sameTopicProgress?: SameTopicProgress | null;
  difficultySignal?: DifficultySignal | null;
  onRetry?: () => void;
  standaloneMode?: boolean;
}

function getTeacherLabel(teacher: TeacherSelection): string {
  switch (teacher.soulId) {
    case 'gentle':
      return '梅老师';
    case 'strict':
      return 'Thornberry 先生';
    case 'energetic':
      return 'Ryan 教练';
    case 'humorous':
      return '幽默老师';
    case 'scholarly':
      return '学院派老师';
    default:
      return '老师复盘';
  }
}

function buildProgressSummary(progress?: SameTopicProgress | null): string | null {
  if (!progress) return null;

  if (progress.trend === 'up' && progress.isBestSoFar) {
    return `同话题第 ${progress.attemptCount} 次提交，这次比上一版明显更稳，目前也是这个话题里最好的一版。`;
  }

  if (progress.trend === 'up') {
    return `同话题第 ${progress.attemptCount} 次提交，这次比上一版更顺一点。`;
  }

  if (progress.trend === 'flat') {
    return `同话题第 ${progress.attemptCount} 次提交，这次和上一版基本持平。`;
  }

  return `同话题第 ${progress.attemptCount} 次提交，这次有一点回摆，但还在同一个练习脉络里。`;
}

function buildDifficultySummary(signal?: DifficultySignal | null): string | null {
  if (!signal) return null;

  if (signal.relation === 'stretch') {
    return `这次目标难度是 ${signal.targetCefr}，高于你当前稳定水平 ${signal.baselineCefr}，表现有波动是正常的。`;
  }

  if (signal.relation === 'easier') {
    return `这次先回到 ${signal.targetCefr} 打基础，低于你当前稳定水平 ${signal.baselineCefr}。`;
  }

  return `这次目标难度 ${signal.targetCefr}，和你当前稳定水平 ${signal.baselineCefr} 基本匹配。`;
}

export function CoachReviewPanel({
  teacher,
  reviewMode,
  autoPlayAudio,
  reviewText,
  speechScript,
  audioReview,
  htmlArtifact,
  sameTopicProgress,
  difficultySignal,
  onRetry,
  standaloneMode = false,
}: CoachReviewPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [resolvedAudioReview, setResolvedAudioReview] = useState(audioReview);
  const [showFullReview, setShowFullReview] = useState(false);
  const [isRetryingAudio, setIsRetryingAudio] = useState(false);
  const progressSummary = buildProgressSummary(sameTopicProgress);
  const difficultySummary = buildDifficultySummary(difficultySignal);
  const teacherLabel = getTeacherLabel(teacher);
  const isLongReview = reviewText.length > 220;
  const collapsedReviewText = isLongReview ? `${reviewText.slice(0, 220).trimEnd()}...` : reviewText;

  useEffect(() => {
    setResolvedAudioReview(audioReview);
  }, [audioReview]);

  const requestAudioReview = useCallback(async (retryCount = 0): Promise<AudioReview> => {
    try {
      const response = await fetch('/api/coach/review-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resolvedAudioReview.requestToken,
          teacher,
          review: {
            mode: reviewMode,
            autoPlayAudio,
          },
          speechScript,
        }),
      });
      const parsed = await parseJsonResponse<{ success?: boolean; error?: string; data?: AudioReview }>(response);
      const result = parsed.data;

      if (!parsed.ok || !result?.success || !result.data) {
        throw new Error(getApiErrorMessage(parsed, '老师语音生成失败'));
      }

      return result.data;
    } catch (error) {
      if (retryCount < 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return requestAudioReview(retryCount + 1);
      }
      throw error;
    }
  }, [resolvedAudioReview.requestToken, teacher, reviewMode, autoPlayAudio, speechScript]);

  const handleAudioToggle = async () => {
    if (!resolvedAudioReview.audioUrl) return;

    if (!audioRef.current) {
      const audio = new Audio(resolvedAudioReview.audioUrl);
      audioRef.current = audio;
      audio.addEventListener('ended', () => setIsPlaying(false));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('play', () => setIsPlaying(true));
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
  };

  useEffect(() => {
    if (!autoPlayAudio) return;
    if (resolvedAudioReview.status !== 'generated' || !resolvedAudioReview.audioUrl) return;
    if (audioRef.current || isPlaying) return;

    const audio = new Audio(resolvedAudioReview.audioUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => setIsPlaying(false));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('play', () => setIsPlaying(true));

    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [resolvedAudioReview.audioUrl, resolvedAudioReview.status, autoPlayAudio, isPlaying]);

  useEffect(() => {
    if (resolvedAudioReview.status !== 'pending') return;
    if (reviewMode !== 'audio' && reviewMode !== 'all') return;

    let cancelled = false;

    const generateAudio = async () => {
      try {
        const nextAudioReview = await requestAudioReview();
        if (!cancelled) {
          setResolvedAudioReview(nextAudioReview);
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedAudioReview((previous) => ({
            ...previous,
            status: 'failed',
            error: error instanceof Error ? error.message : '老师语音生成失败',
          }));
        }
      }
    };

    void generateAudio();

    return () => {
      cancelled = true;
    };
  }, [
    autoPlayAudio,
    resolvedAudioReview.status,
    resolvedAudioReview.requestToken,
    requestAudioReview,
    reviewMode,
    teacher,
    teacher.soulId,
    teacher.voiceId,
    speechScript,
  ]);

  const handleRetryAudio = async () => {
    if (!resolvedAudioReview.requestToken) {
      return;
    }

    setIsRetryingAudio(true);
    setResolvedAudioReview((previous) => ({
      ...previous,
      status: 'pending',
      error: undefined,
    }));

    try {
      const nextAudioReview = await requestAudioReview();
      setResolvedAudioReview(nextAudioReview);
    } catch (error) {
      setResolvedAudioReview((previous) => ({
        ...previous,
        status: 'failed',
        error: error instanceof Error ? error.message : '老师语音生成失败',
      }));
    } finally {
      setIsRetryingAudio(false);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {teacherLabel}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              模式: {reviewMode}
              {autoPlayAudio && ' · 自动播放开启'}
            </div>
          </div>
          <div className="w-fit rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs text-amber-700">
            当前老师
          </div>
        </div>

        <div className="mb-4">
          <div className="whitespace-pre-line text-sm leading-relaxed text-gray-800">
            {showFullReview || !isLongReview ? reviewText : collapsedReviewText}
          </div>
          {isLongReview && (
            <button
              type="button"
              onClick={() => setShowFullReview((current) => !current)}
              className="mt-2 min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
            >
              {showFullReview ? '收起点评全文' : '展开点评全文'}
            </button>
          )}
        </div>

        {(progressSummary || difficultySummary) && (
          <div className="grid gap-3 mb-4 md:grid-cols-2">
            {progressSummary && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  同题进步
                </div>
                <div className="mt-1 text-sm text-emerald-900">
                  {progressSummary}
                </div>
              </div>
            )}
            {difficultySummary && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  难度判断
                </div>
                <div className="mt-1 text-sm text-sky-900">
                  {difficultySummary}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            onClick={handleAudioToggle}
            disabled={resolvedAudioReview.status !== 'generated' || !resolvedAudioReview.audioUrl}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-auto ${
              resolvedAudioReview.status === 'generated'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'cursor-not-allowed bg-gray-100 text-gray-400'
            }`}
          >
            {isPlaying ? '停止老师语音' : '播放老师语音'}
          </button>
          {resolvedAudioReview.status === 'failed' && resolvedAudioReview.requestToken && (
            <button
              type="button"
              onClick={handleRetryAudio}
              disabled={isRetryingAudio}
              className="min-h-11 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 disabled:cursor-not-allowed disabled:text-amber-300"
            >
              {isRetryingAudio ? '重试生成中...' : '重试老师语音'}
            </button>
          )}

          <button
            onClick={() => setIsArtifactOpen(true)}
            disabled={htmlArtifact.status !== 'generated' || !htmlArtifact.html}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-auto ${
              htmlArtifact.status === 'generated'
                ? 'bg-sky-600 text-white hover:bg-sky-700'
                : 'cursor-not-allowed bg-gray-100 text-gray-400'
            }`}
          >
            打开学习页
          </button>

          {!standaloneMode && (
            <Link
              href="/coach/round"
              className="min-h-11 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              独立查看页
            </Link>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              立刻重练
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
            <div className="font-medium text-gray-700 mb-1">音频状态</div>
            <div className="text-gray-600">
              {resolvedAudioReview.status === 'generated' &&
                `已生成 · ${resolvedAudioReview.provider} voice ${resolvedAudioReview.voiceId}`}
              {resolvedAudioReview.status === 'failed' && `生成失败 · ${resolvedAudioReview.error}`}
              {resolvedAudioReview.status === 'skipped' && `未生成 · ${resolvedAudioReview.reason}`}
              {resolvedAudioReview.status === 'pending' && '老师正在录音...'}
            </div>
          </div>

          <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
            <div className="font-medium text-gray-700 mb-1">朗读稿</div>
            <div className="text-gray-600 line-clamp-3">{speechScript}</div>
          </div>
        </div>
      </div>

      <LessonArtifactOverlay
        isOpen={isArtifactOpen}
        title={htmlArtifact.title}
        html={htmlArtifact.html || null}
        onClose={() => setIsArtifactOpen(false)}
        onRetry={onRetry}
      />
    </>
  );
}
