'use client';

import { useState } from 'react';
import { useTTS } from '@/hooks/useTTS';
import type { GrammarHint } from '@/types';

interface GrammarCardProps {
  grammar: GrammarHint;
}

export function GrammarCard({ grammar }: GrammarCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { speak, isSpeaking } = useTTS();

  const handleSpeakExample = () => {
    speak(grammar.example);
  };

  return (
    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-amber-50 hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-600">📝</span>
          <span className="font-medium text-gray-800">{grammar.point}</span>
        </div>
        <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Explanation */}
          <div>
            <div className="text-xs text-gray-500 mb-1">解释</div>
            <div className="text-gray-700">{grammar.explanation}</div>
          </div>

          {/* Pattern */}
          <div>
            <div className="text-xs text-gray-500 mb-1">句型</div>
            <div className="font-mono text-sm bg-gray-100 px-3 py-2 rounded text-gray-800">
              {grammar.pattern}
            </div>
          </div>

          {/* Example */}
          <div>
            <div className="text-xs text-gray-500 mb-1">例句</div>
            <div className="flex items-start gap-2">
              <div className="flex-1 text-gray-700 italic">{grammar.example}</div>
              <button
                onClick={handleSpeakExample}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  bg-amber-50 hover:bg-amber-100 text-amber-600
                  transition-colors flex-shrink-0
                  ${isSpeaking ? 'ring-2 ring-amber-400 animate-pulse' : ''}
                `}
                title="Play example"
              >
                🔊
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GrammarPanelProps {
  grammarHints: GrammarHint[];
  title?: string;
}

export function GrammarPanel({ grammarHints, title = '语法提示' }: GrammarPanelProps) {
  if (grammarHints.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <div className="space-y-2">
        {grammarHints.map((grammar, index) => (
          <GrammarCard key={index} grammar={grammar} />
        ))}
      </div>
    </div>
  );
}
