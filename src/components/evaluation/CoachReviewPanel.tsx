'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LessonArtifactOverlay } from './LessonArtifactOverlay';
import type { AudioReview, HtmlArtifact, ReviewMode, TeacherSelection } from '@/domains/teachers/types';

interface CoachReviewPanelProps {
  teacher: TeacherSelection;
  reviewMode: ReviewMode;
  autoPlayAudio: boolean;
  reviewText: string;
  ttsText: string;
  audioReview: AudioReview;
  htmlArtifact: HtmlArtifact;
  onRetry?: () => void;
  standaloneMode?: boolean;
}

export function CoachReviewPanel({
  teacher,
  reviewMode,
  autoPlayAudio,
  reviewText,
  ttsText,
  audioReview,
  htmlArtifact,
  onRetry,
  standaloneMode = false,
}: CoachReviewPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);

  const handleAudioToggle = async () => {
    if (!audioReview.audioUrl) return;

    if (!audioRef.current) {
      const audio = new Audio(audioReview.audioUrl);
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
    if (audioReview.status !== 'generated' || !audioReview.audioUrl) return;
    if (audioRef.current || isPlaying) return;

    const audio = new Audio(audioReview.audioUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => setIsPlaying(false));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('play', () => setIsPlaying(true));

    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [audioReview.audioUrl, audioReview.status, autoPlayAudio, isPlaying]);

  return (
    <>
      <div className="bg-gradient-to-br from-amber-50 via-white to-sky-50 border border-amber-200 rounded-2xl shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-amber-700 font-semibold">
              Coach Round
            </div>
            <div className="text-lg font-semibold text-gray-900">
              老师复盘
            </div>
            <div className="text-xs text-gray-500 mt-1">
              风格: {teacher.soulId} · 模式: {reviewMode}
              {autoPlayAudio && ' · 自动播放开启'}
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-white/80 border border-amber-200 text-xs text-amber-700">
            runtime
          </div>
        </div>

        <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed mb-4">
          {reviewText}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={handleAudioToggle}
            disabled={audioReview.status !== 'generated' || !audioReview.audioUrl}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              audioReview.status === 'generated'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isPlaying ? '停止老师语音' : '播放老师语音'}
          </button>

          <button
            onClick={() => setIsArtifactOpen(true)}
            disabled={htmlArtifact.status !== 'generated' || !htmlArtifact.html}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              htmlArtifact.status === 'generated'
                ? 'bg-sky-600 text-white hover:bg-sky-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            打开学习页
          </button>

          {!standaloneMode && (
            <Link
              href="/coach/round"
              className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              独立查看页
            </Link>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              立刻重练
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
            <div className="font-medium text-gray-700 mb-1">音频状态</div>
            <div className="text-gray-600">
              {audioReview.status === 'generated' && `已生成 · voice ${audioReview.voiceId}`}
              {audioReview.status === 'failed' && `生成失败 · ${audioReview.error}`}
              {audioReview.status === 'skipped' && `未生成 · ${audioReview.reason}`}
              {audioReview.status === 'pending' && '生成中'}
            </div>
          </div>

          <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
            <div className="font-medium text-gray-700 mb-1">朗读稿</div>
            <div className="text-gray-600 line-clamp-3">{ttsText}</div>
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
