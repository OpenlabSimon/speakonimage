import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { synthesizeWithAzureTTS } from '@/lib/speech/azure';
import { DEFAULT_GEMINI_TTS_MODEL, synthesizeWithGeminiTTS } from '@/lib/speech/gemini';
import type { AudioReview, ReviewPreference, TeacherSelection, TeacherSoulId } from './types';
import { createReviewAudioToken } from './review-audio-token';

const DEFAULT_SOUL_VOICE_IDS: Record<TeacherSoulId, string> = {
  default: 'en-US-AvaMultilingualNeural',
  gentle: 'en-US-AvaMultilingualNeural',
  strict: 'en-GB-OllieMultilingualNeural',
  humorous: 'en-US-AvaMultilingualNeural',
  scholarly: 'en-GB-OllieMultilingualNeural',
  energetic: 'en-US-SteffanMultilingualNeural',
};

const DEFAULT_GEMINI_VOICES: Record<TeacherSoulId, string> = {
  default: 'Puck',
  gentle: 'Sulafat',
  strict: 'Kore',
  humorous: 'Puck',
  scholarly: 'Sadaltager',
  energetic: 'Fenrir',
};

const GEMINI_SPEECH_PROFILES: Record<
  TeacherSoulId,
  {
    role: string;
    coreTone: string;
    emotionalArc: string;
    pacing: string;
    codeSwitch: string;
    emphasis: string;
  }
> = {
  default: {
    role: 'A practical bilingual English coach who sounds warm, grounded, and human.',
    coreTone: 'Supportive, calm, and conversational. Never robotic or overly polished.',
    emotionalArc: 'Start with reassurance, add useful correction, then end with clear momentum.',
    pacing: 'Natural teacher rhythm with short pauses between ideas and slightly warmer emphasis on praise.',
    codeSwitch: 'Switch smoothly between Chinese and English. Keep the English phrases crisp, but never let the Chinese disappear.',
    emphasis: 'Light emphasis on score, strong phrases, and the main correction point.',
  },
  gentle: {
    role: 'A warm bilingual coach with soft, patient, encouraging energy.',
    coreTone: 'Tender, reassuring, and emotionally safe. Sound like a supportive teacher who genuinely believes in the student.',
    emotionalArc: 'Open with warmth, explain corrections gently, then end with sincere encouragement.',
    pacing: 'Slightly slower than normal speech, with soft pauses and a relaxed smile in the voice.',
    codeSwitch: 'Chinese should feel intimate and comforting. English should sound clear, gentle, and natural.',
    emphasis: 'Emphasize encouragement first, then the correction, then a hopeful ending.',
  },
  strict: {
    role: 'A precise bilingual coach with calm authority and disciplined clarity.',
    coreTone: 'Firm, direct, and controlled, but never harsh or cold.',
    emotionalArc: 'Acknowledge what worked, deliver correction with precision, then close with focused confidence.',
    pacing: 'Measured and economical. Short pauses, no rambling, no exaggerated hype.',
    codeSwitch: 'Chinese should feel crisp and authoritative. English phrases should sound exact and intentional.',
    emphasis: 'Emphasize the error category and the corrected form with confident clarity.',
  },
  humorous: {
    role: 'A witty bilingual coach who sounds playful, quick, and charming.',
    coreTone: 'Light teasing, upbeat, and entertaining without turning into a clown or caricature.',
    emotionalArc: 'Hook with playful delight, point out the issue with a smile, then finish with upbeat encouragement.',
    pacing: 'Lively and responsive with small comedic pauses where the line naturally lands.',
    codeSwitch: 'Code-switch freely and naturally. Chinese should carry the punchline; English should add sparkle and attitude.',
    emphasis: 'Emphasize the funniest image or phrase, but keep the correction understandable.',
  },
  scholarly: {
    role: 'A knowledgeable bilingual coach who sounds thoughtful, articulate, and composed.',
    coreTone: 'Clear, intelligent, and steady. Never stiff, never dry.',
    emotionalArc: 'Frame the feedback clearly, explain the correction elegantly, then end with a composed forward-looking note.',
    pacing: 'Even, structured, and controlled, with slightly longer pauses at paragraph transitions.',
    codeSwitch: 'Chinese should sound polished and explanatory. English terms should sound precise and well-placed.',
    emphasis: 'Emphasize structure, clarity, and the key principle behind the correction.',
  },
  energetic: {
    role: 'A high-energy bilingual coach with motivating hype and strong human warmth.',
    coreTone: 'Excited, charismatic, and uplifting. Sound like a coach who is thrilled by the student’s progress.',
    emotionalArc: 'Start with a burst of excitement, ride that energy through the praise, land the correction clearly, then finish with a strong motivational lift.',
    pacing: 'Fast but intelligible, with punchy pauses after high-impact phrases and clean resets before corrections.',
    codeSwitch: 'Let Chinese carry the emotional force and let English phrases punch through with attitude. Both languages must remain clearly audible.',
    emphasis: 'Strong emphasis on praise, score, standout phrases, and the single most important correction.',
  },
};

interface BuildAudioReviewInput {
  teacher: TeacherSelection;
  review: ReviewPreference;
  speechScript: string;
  sessionId?: string;
}

export function buildPendingAudioReview(input: BuildAudioReviewInput): AudioReview {
  const preferredProvider = resolveCoachReviewProvider();

  if (input.review.mode !== 'audio' && input.review.mode !== 'all') {
    return {
      enabled: false,
      provider: preferredProvider,
      status: 'skipped',
      reason: 'review mode does not require audio',
    };
  }

  const voiceId =
    preferredProvider === 'gemini'
      ? DEFAULT_GEMINI_VOICES[input.teacher.soulId]
      : input.teacher.voiceId || DEFAULT_SOUL_VOICE_IDS[input.teacher.soulId];

  if (!voiceId) {
    return {
      enabled: false,
      provider: preferredProvider,
      status: 'skipped',
      reason: 'no voice configured for selected teacher',
    };
  }

  return {
    enabled: true,
    provider: preferredProvider,
    status: 'pending',
    requestToken: createReviewAudioToken({
      teacher: input.teacher,
      review: input.review,
      speechScript: input.speechScript,
      sessionId: input.sessionId,
    }),
    voiceId,
    text: input.speechScript,
  };
}

export async function buildAudioReview(input: BuildAudioReviewInput): Promise<AudioReview> {
  const pending = buildPendingAudioReview(input);
  const preferredProvider = pending.provider;

  if (pending.status === 'skipped') {
    return pending;
  }

  const voiceId = pending.voiceId;

  try {
    let audioBuffer: ArrayBuffer;
    let audioUrl: string;
    let provider: AudioReview['provider'] = preferredProvider;
    let format: AudioReview['format'] = 'mp3';
    let contentType = 'audio/mpeg';
    let reportedVoiceId = voiceId;

    if (preferredProvider === 'gemini') {
      try {
        const geminiVoiceName = DEFAULT_GEMINI_VOICES[input.teacher.soulId];
        const geminiAudio = await synthesizeWithGeminiTTS({
          apiKey: process.env.GEMINI_TTS_API_KEY || '',
          model: process.env.GEMINI_TTS_MODEL || DEFAULT_GEMINI_TTS_MODEL,
          voiceName: geminiVoiceName,
          prompt: buildGeminiSpeechPrompt(input.teacher.soulId, input.speechScript),
        });
        audioBuffer = geminiAudio.audioBuffer;
        format = geminiAudio.format;
        contentType = geminiAudio.contentType;
        reportedVoiceId = geminiVoiceName;
      } catch (error) {
        console.error('Gemini coach-review TTS error, falling back to Azure:', error);
        audioBuffer = await synthesizeWithAzureTTS(input.speechScript, voiceId);
        provider = 'azure';
      }
    } else {
      audioBuffer = await synthesizeWithAzureTTS(input.speechScript, voiceId);
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const extension = format === 'wav' ? 'wav' : 'mp3';
      const filename = `coach-reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const blob = await put(filename, Buffer.from(audioBuffer), {
        access: 'public',
        contentType,
      });
      audioUrl = blob.url;
    } else {
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      audioUrl = `data:${contentType};base64,${base64Audio}`;
    }

    if (input.sessionId) {
      await persistCoachReviewAudioMetadata({
        sessionId: input.sessionId,
        speechScript: input.speechScript,
        audioUrl,
        provider,
        voiceId: reportedVoiceId,
        format,
      });
    }

    return {
      enabled: true,
      provider,
      status: 'generated',
      voiceId: reportedVoiceId,
      text: input.speechScript,
      audioUrl,
      format,
    };
  } catch (error) {
    return {
      enabled: true,
      provider: preferredProvider,
      status: 'failed',
      voiceId,
      text: input.speechScript,
      error: error instanceof Error ? error.message : 'audio generation failed',
    };
  }
}

async function persistCoachReviewAudioMetadata(input: {
  sessionId: string;
  speechScript: string;
  audioUrl: string;
  provider: AudioReview['provider'];
  voiceId?: string;
  format?: AudioReview['format'];
}) {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: input.sessionId,
        role: 'assistant',
        contentType: 'evaluation',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, metadata: true },
    });

    const message = messages.find((candidate) => {
      if (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
        return false;
      }
      const metadata = candidate.metadata as Record<string, unknown>;
      return metadata.kind === 'coach_review' && metadata.speechScript === input.speechScript;
    });

    if (!message || !message.metadata || typeof message.metadata !== 'object' || Array.isArray(message.metadata)) {
      return;
    }

    const metadata = message.metadata as Record<string, unknown>;
    if (metadata.kind !== 'coach_review' || metadata.speechScript !== input.speechScript) {
      return;
    }

    await prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          audioUrl: input.audioUrl,
          audioProvider: input.provider,
          audioVoiceId: input.voiceId,
          audioFormat: input.format,
        },
      },
    });
  } catch (error) {
    console.error('Persist coach review audio metadata error:', error);
  }
}

function resolveCoachReviewProvider(): AudioReview['provider'] {
  if (process.env.COACH_REVIEW_TTS_PROVIDER === 'azure') {
    return 'azure';
  }

  if (process.env.GEMINI_TTS_API_KEY) {
    return 'gemini';
  }

  return 'azure';
}

export function buildGeminiSpeechPrompt(soulId: TeacherSoulId, transcript: string): string {
  const profile = GEMINI_SPEECH_PROFILES[soulId];

  return [
    `# AUDIO PROFILE`,
    `Role: ${profile.role}`,
    `Core tone: ${profile.coreTone}`,
    `Emotional arc: ${profile.emotionalArc}`,
    `Pacing: ${profile.pacing}`,
    `Code-switching: ${profile.codeSwitch}`,
    `Emphasis: ${profile.emphasis}`,
    `Read the feedback like a real teacher speaking to one student, not like an announcer, narrator, or customer-service bot.`,
    `Use natural micro-pauses at commas and stronger pauses at sentence boundaries.`,
    `Keep both the Chinese and English audible and clear.`,
    `Do not summarize, do not omit any words, do not paraphrase, and do not add extra filler.`,
    `## TRANSCRIPT`,
    transcript,
  ].join('\n');
}
