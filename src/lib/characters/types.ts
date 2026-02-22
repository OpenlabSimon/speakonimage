// Teacher character system types

export type TeacherCharacterId = 'thornberry' | 'mei' | 'ryan';

export interface ElevenLabsVoiceConfig {
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost?: boolean;
}

export interface CharacterClasses {
  border: string;
  bg: string;
  bgLight: string;
  text: string;
  textDark: string;
  ring: string;
}

export interface TeacherCharacter {
  id: TeacherCharacterId;
  name: string;
  emoji: string;
  tagline: string;
  color: string;
  classes: CharacterClasses;
  persona: string; // Full persona prompt for LLM
  voiceConfig: ElevenLabsVoiceConfig;
}

export type CharacterMood = 'impressed' | 'encouraging' | 'tough-love' | 'neutral';

export interface CharacterFeedback {
  feedbackText: string;
  ttsText: string;
  mood: CharacterMood;
}
