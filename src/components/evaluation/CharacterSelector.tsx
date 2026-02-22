'use client';

import { CHARACTER_LIST } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';

interface CharacterSelectorProps {
  selectedId: TeacherCharacterId;
  onSelect: (id: TeacherCharacterId) => void;
}

export function CharacterSelector({ selectedId, onSelect }: CharacterSelectorProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {CHARACTER_LIST.map((character) => {
        const isSelected = character.id === selectedId;
        return (
          <button
            key={character.id}
            onClick={() => onSelect(character.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              isSelected
                ? `${character.classes.border} ${character.classes.bgLight} ${character.classes.textDark} ring-1 ${character.classes.ring}`
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl">{character.emoji}</span>
            <div className="text-left">
              <div className={`text-sm font-medium ${isSelected ? character.classes.textDark : ''}`}>
                {character.name}
              </div>
              <div className="text-xs text-gray-400">{character.tagline}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
