'use client';

import { useState } from 'react';
import type { CEFRLevel } from '@/types';

interface LevelChangeModalProps {
  isOpen: boolean;
  direction: 'up' | 'down';
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  scoreDifference?: number;
  onAccept: () => void;
  onDecline: () => void;
  onManualSelect: (level: CEFRLevel) => void;
}

const LEVEL_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: '入门 - 基本的短语和表达',
  A2: '初级 - 简单的日常情境',
  B1: '中级 - 应对大部分旅行场景',
  B2: '中高级 - 讨论复杂话题和观点',
  C1: '高级 - 流利自如地表达',
  C2: '精通 - 接近母语水平',
};

export function LevelChangeModal({
  isOpen,
  direction,
  fromLevel,
  toLevel,
  onAccept,
  onDecline,
  onManualSelect,
}: LevelChangeModalProps) {
  const [showManualSelect, setShowManualSelect] = useState(false);

  if (!isOpen) return null;

  const isUpgrade = direction === 'up';

  const handleManualSelectClick = () => {
    setShowManualSelect(true);
  };

  const handleLevelSelect = (level: CEFRLevel) => {
    onManualSelect(level);
    setShowManualSelect(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div
          className={`p-6 ${
            isUpgrade
              ? 'bg-gradient-to-r from-green-500 to-emerald-600'
              : 'bg-gradient-to-r from-amber-500 to-orange-600'
          } text-white`}
        >
          <div className="text-3xl mb-2">{isUpgrade ? '等级提升!' : '等级调整'}</div>
          <h2 className="text-xl font-semibold">
            {isUpgrade
              ? '你的表现有所进步！'
              : '根据最近的表现，建议调整等级'}
          </h2>
        </div>

        {/* Body */}
        <div className="p-6">
          {!showManualSelect ? (
            <>
              {/* Level Change Display */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">当前</div>
                  <div className="text-3xl font-bold text-gray-400">
                    {fromLevel}
                  </div>
                </div>
                <div
                  className={`text-2xl ${
                    isUpgrade ? 'text-green-500' : 'text-amber-500'
                  }`}
                >
                  {isUpgrade ? 'arrow_upward' : 'arrow_downward'}
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">建议</div>
                  <div
                    className={`text-3xl font-bold ${
                      isUpgrade ? 'text-green-600' : 'text-amber-600'
                    }`}
                  >
                    {toLevel}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-600 text-sm mb-6 text-center">
                {isUpgrade
                  ? `升级到 ${toLevel} 将提供更有挑战性的内容，帮助你更快成长。`
                  : `调整到 ${toLevel} 将帮助你用更适合的内容建立信心。`}
              </p>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={onAccept}
                  className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
                    isUpgrade
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {isUpgrade
                    ? `好的，挑战 ${toLevel}！`
                    : `好的，调整到 ${toLevel}`}
                </button>

                <button
                  onClick={onDecline}
                  className="w-full py-3 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                >
                  {isUpgrade
                    ? `留在 ${fromLevel} 继续巩固`
                    : `保持 ${fromLevel} 接受挑战`}
                </button>

                <button
                  onClick={handleManualSelectClick}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
                >
                  让我自己选择等级
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Manual Level Selection */}
              <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">
                选择你的等级
              </h3>

              <div className="space-y-2">
                {(
                  ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CEFRLevel[]
                ).map((level) => (
                  <button
                    key={level}
                    onClick={() => handleLevelSelect(level)}
                    className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                      level === toLevel
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-800">{level}</span>
                        <span className="text-gray-500 text-sm ml-2">
                          {LEVEL_DESCRIPTIONS[level]}
                        </span>
                      </div>
                      {level === fromLevel && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          当前
                        </span>
                      )}
                      {level === toLevel && (
                        <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded">
                          建议
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowManualSelect(false)}
                className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                返回
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
