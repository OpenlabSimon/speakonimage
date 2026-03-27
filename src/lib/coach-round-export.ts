import type { StoredCoachRound } from './coach-round-storage';

export interface CoachRoundSummaryPayload {
  createdAt: string;
  inputMethod: string;
  practiceMode?: string;
  skillDomain?: string;
  sameTopicProgress?: {
    attemptCount: number;
    deltaFromLast: number;
    isBestSoFar: boolean;
  } | null;
  difficultySignal?: {
    targetCefr: string;
    baselineCefr: string;
    relation: 'stretch' | 'matched' | 'easier';
  } | null;
  teacherSoulId: string;
  teacherVoiceId?: string;
  reviewMode: string;
  autoPlayAudio: boolean;
  userResponse: string;
  reviewText: string;
  speechScript: string;
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
    inputMethod: round.inputMethod,
    practiceMode: round.practiceMode,
    skillDomain: round.skillDomain,
    sameTopicProgress: round.sameTopicProgress ?? null,
    difficultySignal: round.difficultySignal ?? null,
    teacherSoulId: round.teacher.soulId,
    teacherVoiceId: round.teacher.voiceId,
    reviewMode: round.reviewMode,
    autoPlayAudio: round.autoPlayAudio,
    userResponse: round.userResponse,
    reviewText: round.reviewText,
    speechScript: round.speechScript,
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
    `Input Method: ${round.inputMethod}`,
    round.practiceMode ? `Practice Mode: ${round.practiceMode}` : null,
    round.skillDomain ? `Skill Domain: ${round.skillDomain}` : null,
    round.sameTopicProgress
      ? `Same Topic Progress: attempt ${round.sameTopicProgress.attemptCount}, delta ${round.sameTopicProgress.deltaFromLast}, best ${round.sameTopicProgress.isBestSoFar ? 'yes' : 'no'}`
      : null,
    round.difficultySignal
      ? `Difficulty Signal: ${round.difficultySignal.relation}, target ${round.difficultySignal.targetCefr}, baseline ${round.difficultySignal.baselineCefr}`
      : null,
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
