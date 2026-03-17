import { getCharacter } from '@/lib/characters';
import type { TeacherCharacterId } from '@/lib/characters/types';
import type { ReviewMode, TeacherSelection } from './types';

export function teacherSelectionFromCharacter(
  characterId: TeacherCharacterId,
  voiceId?: string
): TeacherSelection {
  const resolvedVoiceId = voiceId || getCharacter(characterId).voiceConfig.voiceId;

  switch (characterId) {
    case 'mei':
      return { soulId: 'gentle', voiceId: resolvedVoiceId };
    case 'thornberry':
      return { soulId: 'strict', voiceId: resolvedVoiceId };
    case 'ryan':
      return { soulId: 'energetic', voiceId: resolvedVoiceId };
  }
}

export const REVIEW_MODE_OPTIONS: Array<{
  id: ReviewMode;
  label: string;
}> = [
  { id: 'text', label: '只看文字' },
  { id: 'audio', label: '只听点评' },
  { id: 'html', label: '学习页' },
  { id: 'all', label: '全部' },
];
