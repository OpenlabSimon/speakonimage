import { put } from '@vercel/blob';
import { synthesizeWithElevenLabs } from '@/lib/speech/elevenlabs';
import type { AudioReview, ReviewPreference, TeacherSelection, TeacherSoulId } from './types';

const DEFAULT_SOUL_VOICE_IDS: Record<TeacherSoulId, string> = {
  default: 'EXAVITQu4vr4xnSDxMaL',
  gentle: 'EXAVITQu4vr4xnSDxMaL',
  strict: 'pNInz6obpgDQGcFmaJgB',
  humorous: 'VR6AewLTigWG4xSOukaG',
  scholarly: 'pNInz6obpgDQGcFmaJgB',
  energetic: 'VR6AewLTigWG4xSOukaG',
};

interface BuildAudioReviewInput {
  teacher: TeacherSelection;
  review: ReviewPreference;
  ttsText: string;
}

export async function buildAudioReview(input: BuildAudioReviewInput): Promise<AudioReview> {
  if (input.review.mode !== 'audio' && input.review.mode !== 'all') {
    return {
      enabled: false,
      provider: 'elevenlabs',
      status: 'skipped',
      reason: 'review mode does not require audio',
    };
  }

  const voiceId = input.teacher.voiceId || DEFAULT_SOUL_VOICE_IDS[input.teacher.soulId];

  if (!voiceId) {
    return {
      enabled: false,
      provider: 'elevenlabs',
      status: 'skipped',
      reason: 'no voice configured for selected teacher',
    };
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return {
      enabled: true,
      provider: 'elevenlabs',
      status: 'failed',
      voiceId,
      text: input.ttsText,
      error: 'ELEVENLABS_API_KEY not configured',
    };
  }

  try {
    const audioBuffer = await synthesizeWithElevenLabs(input.ttsText, voiceId);
    let audioUrl: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const filename = `coach-reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      const blob = await put(filename, Buffer.from(audioBuffer), {
        access: 'public',
        contentType: 'audio/mpeg',
      });
      audioUrl = blob.url;
    } else {
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    }

    return {
      enabled: true,
      provider: 'elevenlabs',
      status: 'generated',
      voiceId,
      text: input.ttsText,
      audioUrl,
      format: 'mp3',
    };
  } catch (error) {
    return {
      enabled: true,
      provider: 'elevenlabs',
      status: 'failed',
      voiceId,
      text: input.ttsText,
      error: error instanceof Error ? error.message : 'audio generation failed',
    };
  }
}
