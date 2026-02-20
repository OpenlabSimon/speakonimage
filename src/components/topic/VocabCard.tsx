'use client';

import { useTTS } from '@/hooks/useTTS';
import type { VocabularyItem } from '@/types';

interface VocabCardProps {
  vocab: VocabularyItem;
  compact?: boolean;
}

export function VocabCard({ vocab, compact = false }: VocabCardProps) {
  const { speak, isSpeaking } = useTTS();

  const handleSpeak = () => {
    speak(vocab.word);
  };

  if (compact) {
    return (
      <button
        onClick={handleSpeak}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-blue-50 hover:bg-blue-100 border border-blue-200
          transition-colors text-sm
          ${isSpeaking ? 'ring-2 ring-blue-400' : ''}
        `}
      >
        <span className="font-medium text-blue-800">{vocab.word}</span>
        <span className="text-blue-600 text-xs">{vocab.chinese}</span>
        <span className="text-blue-400">🔊</span>
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Word and pronunciation */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">{vocab.word}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
              {vocab.partOfSpeech}
            </span>
          </div>
          <div className="text-sm text-gray-500 font-mono">{vocab.phonetic}</div>
        </div>
        <button
          onClick={handleSpeak}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center
            bg-blue-50 hover:bg-blue-100 text-blue-600
            transition-colors
            ${isSpeaking ? 'ring-2 ring-blue-400 animate-pulse' : ''}
          `}
          title="Play pronunciation"
        >
          🔊
        </button>
      </div>

      {/* Chinese translation */}
      <div className="text-base text-gray-700 mb-2">
        {vocab.chinese}
      </div>

      {/* Example context */}
      <div className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">
        {vocab.exampleContext}
      </div>

      {/* CEFR level if available */}
      {vocab.cefrLevel && (
        <div className="mt-2">
          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
            {vocab.cefrLevel}
          </span>
        </div>
      )}
    </div>
  );
}
