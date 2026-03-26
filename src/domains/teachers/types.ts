export type TeacherSoulId =
  | 'default'
  | 'gentle'
  | 'strict'
  | 'humorous'
  | 'scholarly'
  | 'energetic';

export type ReviewMode = 'text' | 'audio' | 'html' | 'all';

export interface TeacherSelection {
  soulId: TeacherSoulId;
  voiceId?: string;
}

export interface ReviewPreference {
  mode: ReviewMode;
  autoPlayAudio: boolean;
}

export interface AudioReview {
  enabled: boolean;
  provider: 'elevenlabs' | 'azure' | 'gemini';
  status: 'skipped' | 'pending' | 'generated' | 'failed';
  requestToken?: string;
  voiceId?: string;
  text?: string;
  reason?: string;
  audioUrl?: string;
  format?: 'mp3' | 'wav';
  error?: string;
}

export interface HtmlArtifact {
  enabled: boolean;
  status: 'skipped' | 'generated';
  title?: string;
  html?: string;
  reason?: string;
}
