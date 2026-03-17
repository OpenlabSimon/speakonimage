'use client';

import { useState } from 'react';

interface LessonArtifactOverlayProps {
  isOpen: boolean;
  title?: string;
  html: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function LessonArtifactOverlay({
  isOpen,
  title,
  html,
  onClose,
  onRetry,
}: LessonArtifactOverlayProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !html) return null;

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(title || 'coach-artifact').replace(/\s+/g, '-').toLowerCase()}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-white/95 border-b border-slate-200 shrink-0">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Coach Artifact
          </div>
          <div className="text-sm font-semibold text-slate-900">
            {title || '本轮学习页'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          aria-label="关闭学习页"
        >
          ✕
        </button>
      </div>

      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0 bg-white"
        title={title || '学习页'}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/95 border-t border-slate-200 shrink-0">
        <div className="text-xs text-slate-500">
          {copied ? 'HTML 已复制到剪贴板' : '可复制或下载当前 lesson artifact'}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyHtml}
            className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            复制 HTML
          </button>
          <button
            onClick={handleDownloadHtml}
            className="px-3 py-2 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200 transition-colors"
          >
            下载学习页
          </button>
          {onRetry && (
            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              回到重练
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
