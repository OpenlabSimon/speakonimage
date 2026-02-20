'use client';

import { useState } from 'react';
import { VocabCard } from './VocabCard';
import type { VocabularyItem } from '@/types';

interface VocabPanelProps {
  vocabulary: VocabularyItem[];
  title?: string;
}

export function VocabPanel({ vocabulary, title = '推荐词汇' }: VocabPanelProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');

  if (vocabulary.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              viewMode === 'cards'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            卡片
          </button>
          <button
            onClick={() => setViewMode('compact')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              viewMode === 'compact'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            紧凑
          </button>
        </div>
      </div>

      {/* Vocabulary items */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vocabulary.map((vocab, index) => (
            <VocabCard key={index} vocab={vocab} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {vocabulary.map((vocab, index) => (
            <VocabCard key={index} vocab={vocab} compact />
          ))}
        </div>
      )}
    </div>
  );
}
