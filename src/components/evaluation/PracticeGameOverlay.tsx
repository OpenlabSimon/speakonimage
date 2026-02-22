'use client';

import type { GameProgress, GameResult } from '@/hooks/usePracticeGame';

interface PracticeGameOverlayProps {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  gameHtml: string | null;
  gameProgress: GameProgress | null;
  gameResult: GameResult | null;
  characterEmoji?: string;
  onClose: () => void;
}

export function PracticeGameOverlay({
  isOpen,
  isLoading,
  error,
  gameHtml,
  gameProgress,
  gameResult,
  characterEmoji = '🌸',
  onClose,
}: PracticeGameOverlayProps) {
  if (!isOpen) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] bg-gradient-to-br from-purple-900/95 to-indigo-900/95 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">{characterEmoji}</div>
          <div className="animate-spin inline-block w-8 h-8 border-3 border-white border-t-transparent rounded-full mb-4" />
          <div className="text-white text-lg font-medium">生成趣味练习中...</div>
          <div className="text-white/60 text-sm mt-2">正在为你定制互动游戏</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-gradient-to-br from-purple-900/95 to-indigo-900/95 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">😅</div>
          <div className="text-white text-lg font-medium mb-2">生成失败</div>
          <div className="text-white/70 text-sm mb-6">{error}</div>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white text-purple-700 rounded-xl font-medium hover:bg-gray-100 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  // Completion state (game finished)
  if (gameResult) {
    const percentage = Math.round((gameResult.score / gameResult.totalPossible) * 100);
    return (
      <div className="fixed inset-0 z-[60] bg-gradient-to-br from-purple-900/95 to-indigo-900/95 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="text-6xl mb-4">
            {percentage >= 80 ? '🎉' : percentage >= 50 ? '💪' : '📚'}
          </div>
          <div className="text-white text-2xl font-bold mb-2">
            {gameResult.score}/{gameResult.totalPossible}
          </div>
          <div className="text-white/80 text-lg mb-1">
            {percentage >= 80 ? '太棒了！' : percentage >= 50 ? '继续加油！' : '多练习就会进步！'}
          </div>
          <div className="text-white/50 text-sm mb-6">
            正确率 {percentage}%
          </div>
          {gameResult.mistakes.length > 0 && (
            <div className="bg-white/10 rounded-xl p-4 mb-6 text-left">
              <div className="text-white/70 text-xs mb-2">需要注意：</div>
              {gameResult.mistakes.map((m, i) => (
                <div key={i} className="text-white/90 text-sm mb-1">
                  • {m}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            className="px-8 py-3 bg-white text-purple-700 rounded-xl font-medium hover:bg-gray-100 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  // Playing state — iframe with game
  if (gameHtml) {
    const progressPercent = gameProgress
      ? Math.round((gameProgress.current / gameProgress.total) * 100)
      : 0;

    return (
      <div className="fixed inset-0 z-[60] bg-white flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span>{characterEmoji}</span>
            {gameProgress && (
              <span>{gameProgress.current}/{gameProgress.total}</span>
            )}
          </div>
          {/* Progress bar */}
          {gameProgress && (
            <div className="flex-1 mx-4 h-2 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-lg"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Game iframe */}
        <iframe
          srcDoc={gameHtml}
          sandbox="allow-scripts"
          className="flex-1 w-full border-0"
          title="练习游戏"
        />
      </div>
    );
  }

  return null;
}
