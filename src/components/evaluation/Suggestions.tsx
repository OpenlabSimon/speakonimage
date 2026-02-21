'use client';

import { useTTS } from '@/hooks/useTTS';

interface SuggestionsProps {
  betterExpressions: string[];
  suggestions: {
    immediate: string;
    longTerm: string;
  };
}

export function Suggestions({ betterExpressions, suggestions }: SuggestionsProps) {
  const { speak, isSpeaking, isLoading } = useTTS({ provider: 'elevenlabs' });

  const handleSpeak = (text: string) => {
    speak(text);
  };

  const isActive = isSpeaking || isLoading;

  return (
    <div className="space-y-4">
      {/* Better Expressions */}
      {betterExpressions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
            <h3 className="font-semibold text-indigo-800">Better Ways to Say It</h3>
            <p className="text-xs text-indigo-600">Click to hear pronunciation</p>
          </div>
          <div className="p-4 space-y-2">
            {betterExpressions.map((expr, i) => (
              <button
                key={i}
                onClick={() => handleSpeak(expr)}
                disabled={isActive}
                className={`
                  w-full text-left bg-indigo-50 rounded-lg p-3 text-indigo-800 text-sm
                  border-l-4 border-indigo-400 hover:bg-indigo-100 transition-colors
                  flex items-center justify-between gap-2
                  ${isActive ? 'opacity-70' : ''}
                `}
              >
                <span>"{expr}"</span>
                <span className={`text-indigo-400 ${isLoading ? 'animate-pulse' : ''}`}>
                  {isLoading ? '...' : '🔊'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Tip */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-green-50 px-4 py-2 border-b border-green-100">
          <h3 className="font-semibold text-green-800">Quick Tip</h3>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm">{suggestions.immediate}</p>
        </div>
      </div>

      {/* Long-term Improvement */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-purple-50 px-4 py-2 border-b border-purple-100">
          <h3 className="font-semibold text-purple-800">For Long-term Growth</h3>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-sm">{suggestions.longTerm}</p>
        </div>
      </div>
    </div>
  );
}
