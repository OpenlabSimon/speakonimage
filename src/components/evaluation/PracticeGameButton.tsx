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
      className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-indigo-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
