'use client';

import { useState } from 'react';
import type { CEFRLevel } from '@/types';

interface LevelChangeModalProps {
  isOpen: boolean;
  direction: 'up' | 'down';
  fromLevel: CEFRLevel;
  toLevel: CEFRLevel;
  scoreDifference: number;
  onAccept: () => void;
  onDecline: () => void;
  onManualSelect: (level: CEFRLevel) => void;
}

const LEVEL_DESCRIPTIONS: Record<CEFRLevel, string> = {
  A1: 'Beginner - Basic phrases and expressions',
  A2: 'Elementary - Simple everyday situations',
  B1: 'Intermediate - Handle most travel situations',
  B2: 'Upper Intermediate - Complex topics and ideas',
  C1: 'Advanced - Fluent and spontaneous',
  C2: 'Proficient - Near-native fluency',
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
          <div className="text-3xl mb-2">{isUpgrade ? 'Level Up!' : 'Adjustment'}</div>
          <h2 className="text-xl font-semibold">
            {isUpgrade
              ? 'Your performance has improved!'
              : 'Your recent performance suggests a different level'}
          </h2>
        </div>

        {/* Body */}
        <div className="p-6">
          {!showManualSelect ? (
            <>
              {/* Level Change Display */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Current</div>
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
                  <div className="text-sm text-gray-500 mb-1">Suggested</div>
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
                  ? `Upgrading to ${toLevel} will provide more challenging content to help you grow.`
                  : `Adjusting to ${toLevel} will help you build confidence with more manageable content.`}
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
                    ? `Yes, challenge me with ${toLevel}!`
                    : `Yes, adjust to ${toLevel}`}
                </button>

                <button
                  onClick={onDecline}
                  className="w-full py-3 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                >
                  {isUpgrade
                    ? `Stay at ${fromLevel} for more fluency practice`
                    : `Keep ${fromLevel} for the challenge`}
                </button>

                <button
                  onClick={handleManualSelectClick}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
                >
                  Let me choose my level
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Manual Level Selection */}
              <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">
                Choose Your Level
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
                          Current
                        </span>
                      )}
                      {level === toLevel && (
                        <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded">
                          Suggested
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
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
