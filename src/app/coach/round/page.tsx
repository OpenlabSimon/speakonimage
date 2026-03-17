'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CoachRoundViewer } from '@/components/evaluation/CoachRoundViewer';
import {
  loadCoachRoundHistory,
  loadLatestCoachRound,
  type StoredCoachRound,
} from '@/lib/coach-round-storage';

export default function CoachRoundPage() {
  const [round, setRound] = useState<StoredCoachRound | null>(null);
  const [history, setHistory] = useState<StoredCoachRound[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const latest = loadLatestCoachRound();
    const recent = loadCoachRoundHistory();

    setRound(latest);
    setHistory(recent);
    setIsLoaded(true);
  }, []);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="animate-spin text-4xl mb-4">...</div>
          <div>加载最近一次 coach round...</div>
        </div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-lg p-6">
          <div className="text-lg font-semibold text-gray-900 mb-2">没有可查看的 coach round</div>
          <div className="text-sm text-gray-500 mb-4">
            先完成一次练习评估，再打开独立查看页。
          </div>
          <Link
            href="/"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <CoachRoundViewer
      round={round}
      history={history}
      selectedRoundId={round.id}
      onSelectRound={(id) => {
        const selected = history.find((item) => item.id === id);
        if (selected) {
          setRound(selected);
        }
      }}
    />
  );
}
