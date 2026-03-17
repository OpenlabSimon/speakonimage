import type { StoredCoachRound } from './coach-round-storage';

export interface CoachRoundSummaryPayload {
  createdAt: string;
  overallScore: number;
  inputMethod: string;
  practiceMode?: string;
  skillDomain?: string;
  teacherSoulId: string;
  teacherVoiceId?: string;
  reviewMode: string;
  autoPlayAudio: boolean;
  userResponse: string;
  reviewText: string;
  ttsText: string;
  audioReview: {
    status: string;
    voiceId?: string;
    audioUrl?: string;
  };
  htmlArtifact: {
    status: string;
    title?: string;
  };
}

export function buildCoachRoundSummaryPayload(
  round: StoredCoachRound
): CoachRoundSummaryPayload {
  return {
    createdAt: round.createdAt,
    overallScore: round.overallScore,
    inputMethod: round.inputMethod,
    practiceMode: round.practiceMode,
    skillDomain: round.skillDomain,
    teacherSoulId: round.teacher.soulId,
    teacherVoiceId: round.teacher.voiceId,
    reviewMode: round.reviewMode,
    autoPlayAudio: round.autoPlayAudio,
    userResponse: round.userResponse,
    reviewText: round.reviewText,
    ttsText: round.ttsText,
    audioReview: {
      status: round.audioReview.status,
      voiceId: round.audioReview.voiceId,
      audioUrl: round.audioReview.audioUrl,
    },
    htmlArtifact: {
      status: round.htmlArtifact.status,
      title: round.htmlArtifact.title,
    },
  };
}

export function buildCoachRoundSummaryText(round: StoredCoachRound): string {
  const lines = [
    'SpeakOnImage Coach Round Summary',
    `Created At: ${new Date(round.createdAt).toLocaleString()}`,
    `Score: ${round.overallScore}/100`,
    `Input Method: ${round.inputMethod}`,
    round.practiceMode ? `Practice Mode: ${round.practiceMode}` : null,
    round.skillDomain ? `Skill Domain: ${round.skillDomain}` : null,
    `Teacher Soul: ${round.teacher.soulId}`,
    round.teacher.voiceId ? `Teacher Voice ID: ${round.teacher.voiceId}` : null,
    `Review Mode: ${round.reviewMode}`,
    `Auto Play Audio: ${round.autoPlayAudio ? 'on' : 'off'}`,
    '',
    'User Response:',
    round.userResponse,
    '',
    'Review Text:',
    round.reviewText,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}
