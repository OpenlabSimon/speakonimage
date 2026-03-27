'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CoachReviewPanel } from './CoachReviewPanel';
import type { StoredCoachRound } from '@/lib/coach-round-storage';
import {
  buildCoachRoundSummaryPayload,
  buildCoachRoundSummaryText,
} from '@/lib/coach-round-export';

interface CoachRoundViewerProps {
  round: StoredCoachRound;
  backHref?: string;
  history?: StoredCoachRound[];
  selectedRoundId?: string;
  onSelectRound?: (id: string) => void;
}

export function CoachRoundViewer({
  round,
  backHref = '/topic/practice',
  history = [],
  selectedRoundId,
  onSelectRound,
}: CoachRoundViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildCoachRoundSummaryText(round));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadText = () => {
    const blob = new Blob([buildCoachRoundSummaryText(round)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'coach-round-summary.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const payload = buildCoachRoundSummaryPayload(round);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'coach-round-summary.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href={backHref} className="text-gray-600 hover:text-gray-800 text-sm">
            ← 返回
          </Link>
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            首页
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-400 mb-2">
            Coach Round Viewer
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
              输入: {round.inputMethod}
            </span>
            {round.practiceMode && (
              <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">
                模式: {round.practiceMode}
              </span>
            )}
            {round.skillDomain && (
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                能力域: {round.skillDomain}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            {round.userResponse}
          </div>
          <div className="mt-3 text-xs text-gray-400">
            生成时间: {new Date(round.createdAt).toLocaleString()}
          </div>
        </div>

        {history.length > 1 && onSelectRound && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
            <div className="text-sm font-semibold text-gray-900 mb-3">最近的 Coach Rounds</div>
            <div className="grid gap-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectRound(item.id)}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    selectedRoundId === item.id
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">
                      {item.teacher.soulId}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {item.userResponse}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-5 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">导出与分享</div>
              <div className="text-xs text-gray-500 mt-1">
                {copied ? '摘要已复制到剪贴板' : '复制或导出本次 coach round 摘要'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopySummary}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                复制摘要
              </button>
              <button
                onClick={handleDownloadText}
                className="px-3 py-2 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200 transition-colors"
              >
                下载 TXT
              </button>
              <button
                onClick={handleDownloadJson}
                className="px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-colors"
              >
                导出 JSON
              </button>
            </div>
          </div>
        </div>

        <CoachReviewPanel
          teacher={round.teacher}
          reviewMode={round.reviewMode}
          autoPlayAudio={round.autoPlayAudio}
          reviewText={round.reviewText}
          speechScript={round.speechScript}
          audioReview={round.audioReview}
          htmlArtifact={round.htmlArtifact}
          sameTopicProgress={round.sameTopicProgress}
          difficultySignal={round.difficultySignal}
          standaloneMode
        />
      </div>
    </div>
  );
}
