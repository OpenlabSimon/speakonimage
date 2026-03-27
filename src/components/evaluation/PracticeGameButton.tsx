'use client';

interface PracticeGameButtonProps {
  onClick: () => void;
  isLoading?: boolean;
}

export function PracticeGameButton({ onClick, isLoading }: PracticeGameButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 py-3 font-medium text-white transition-all hover:from-purple-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? (
        <>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          生成趣味练习中...
        </>
      ) : (
        <>
          <span>🎮</span>
          趣味练习 — 针对你的错误
        </>
      )}
    </button>
  );
}
