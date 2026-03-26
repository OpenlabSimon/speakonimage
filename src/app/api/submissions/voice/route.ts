import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import { getSpeechTranscriptionAvailability } from '@/lib/speech/transcription-config';
import { runCoachingRound } from '@/domains/runtime/round-orchestrator';
import type { ApiResponse } from '@/types';

const VoiceTeacherSchema = z.object({
  soulId: z
    .enum(['default', 'gentle', 'strict', 'humorous', 'scholarly', 'energetic'])
    .optional(),
  voiceId: z.string().min(1).optional(),
});

const VoiceReviewSchema = z.object({
  mode: z.enum(['text', 'audio', 'html', 'all']).optional(),
  autoPlayAudio: z.boolean().optional(),
});

/**
 * Voice submission endpoint
 * Accepts audio file + topic data, stores audio, returns transcription + evaluation
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Get audio file
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Validate audio file size (50MB max)
    const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Audio file too large (max 50MB)' },
        { status: 413 }
      );
    }

    // Get topic data from form
    const topicDataStr = formData.get('topicData') as string | null;
    if (!topicDataStr) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No topic data provided' },
        { status: 400 }
      );
    }

    let topicData;
    try {
      topicData = JSON.parse(topicDataStr);
    } catch {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid topic data JSON' },
        { status: 400 }
      );
    }

    // Get topicId and sessionId from form data (optional)
    const topicId = formData.get('topicId') as string | null;
    const sessionId = formData.get('sessionId') as string | null;
    const teacherStr = formData.get('teacher') as string | null;
    const reviewStr = formData.get('review') as string | null;
    let teacher: z.infer<typeof VoiceTeacherSchema> | undefined;
    let review: z.infer<typeof VoiceReviewSchema> | undefined;

    if (teacherStr) {
      try {
        teacher = VoiceTeacherSchema.parse(JSON.parse(teacherStr));
      } catch {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid teacher JSON' },
          { status: 400 }
        );
      }
    }

    if (reviewStr) {
      try {
        review = VoiceReviewSchema.parse(JSON.parse(reviewStr));
      } catch {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid review JSON' },
          { status: 400 }
        );
      }
    }

    // Check authentication
    const authResult = await checkAuth();

    // If topicId is provided, require authentication and validate ownership
    if (topicId) {
      if (!authResult.authenticated) {
        return unauthorizedResponse('Authentication required to submit to a saved topic');
      }

      const topic = await prisma.topic.findUnique({
        where: { id: topicId },
        select: { accountId: true },
      });

      if (!topic) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Topic not found' },
          { status: 404 }
        );
      }

      if (topic.accountId !== authResult.user.id) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'You do not have permission to submit to this topic' },
          { status: 403 }
        );
      }
    }

    const availability = getSpeechTranscriptionAvailability();
    if (!availability.available || !availability.speechKey || !availability.speechRegion) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: availability.reason || '语音转写不可用' },
        { status: 503 }
      );
    }

    // Step 1: Store audio recording (if Vercel Blob is configured)
    let audioUrl: string | undefined;
    const arrayBuffer = await audioFile.arrayBuffer();

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const timestamp = Date.now();
        const filename = `recordings/${timestamp}-${Math.random().toString(36).slice(2)}.webm`;

        const blob = await put(filename, Buffer.from(arrayBuffer), {
          access: 'public',
          contentType: audioFile.type || 'audio/webm',
        });

        audioUrl = blob.url;
        console.log('Audio stored:', audioUrl);
      } catch (storageError) {
        console.error('Audio storage failed (continuing without storage):', storageError);
      }
    }

    // Step 2: Transcribe audio
    const audioBlob = new Blob([arrayBuffer], { type: audioFile.type });

    const transcriptionResult = await transcribeAudio(audioBlob, {
      speechKey: availability.speechKey,
      speechRegion: availability.speechRegion,
      language: 'en-US',
    });

    if (transcriptionResult.status === 'error') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: transcriptionResult.error || 'Transcription failed' },
        { status: 500 }
      );
    }

    if (transcriptionResult.status === 'no_match' || !transcriptionResult.text) {
      return NextResponse.json<ApiResponse<{
        transcription: string;
        status: 'no_match';
        audioUrl?: string;
      }>>({
        success: true,
        data: {
          transcription: '',
          status: 'no_match',
          audioUrl,
        },
      });
    }

    const transcribedText = transcriptionResult.text;

    // Check if evaluation is requested (skipEvaluation can be used for transcription-only)
    const skipEvaluation = formData.get('skipEvaluation') === 'true';

    if (skipEvaluation) {
      return NextResponse.json<ApiResponse<{
        transcription: string;
        confidence: number | undefined;
        duration: number | undefined;
        status: 'success';
        audioUrl?: string;
      }>>({
        success: true,
        data: {
          transcription: transcribedText,
          confidence: transcriptionResult.confidence,
          duration: transcriptionResult.duration,
          status: 'success',
          audioUrl,
        },
      });
    }

    // Step 3: Evaluate and optionally persist as one coaching round
    const round = await runCoachingRound({
      auth: authResult.authenticated
        ? { authenticated: true, userId: authResult.user.id }
        : { authenticated: false },
      topicType: topicData.type,
      topicContent: {
        chinesePrompt: topicData.chinesePrompt,
        keyPoints: topicData.keyPoints,
        guidingQuestions: topicData.guidingQuestions,
        suggestedVocab: topicData.suggestedVocab || [],
        grammarHints: topicData.grammarHints,
        difficultyMetadata: topicData.difficultyMetadata,
      },
      userResponse: transcribedText,
      inputMethod: 'voice',
      teacher,
      review,
      historyAttempts: topicData.historyAttempts,
      persistence: {
        topicId: topicId || undefined,
        sessionId: sessionId || undefined,
        audioUrl,
      },
      deferAudioReview: true,
    });

    return NextResponse.json<ApiResponse<{
      id?: string;
      transcription: string;
      confidence: number | undefined;
      duration: number | undefined;
      evaluation: typeof round.evaluation;
      overallScore: number;
      inputMethod: 'voice';
      audioUrl?: string;
      practiceMode: typeof round.practiceMode;
      skillDomain: typeof round.skillDomain;
      teacher: typeof round.teacher;
      review: typeof round.review;
      reviewText: string;
      speechScript: string;
      ttsText: string;
      audioReview: typeof round.audioReview;
      htmlArtifact: typeof round.htmlArtifact;
      sameTopicProgress: typeof round.sameTopicProgress;
      difficultySignal: typeof round.difficultySignal;
    }>>({
      success: true,
      data: {
        id: round.submissionId,
        transcription: transcribedText,
        confidence: transcriptionResult.confidence,
        duration: transcriptionResult.duration,
        evaluation: round.evaluation,
        overallScore: round.overallScore,
        inputMethod: 'voice',
        audioUrl,
        practiceMode: round.practiceMode,
        skillDomain: round.skillDomain,
        teacher: round.teacher,
        review: round.review,
        reviewText: round.reviewText,
        speechScript: round.speechScript,
        ttsText: round.ttsText,
        audioReview: round.audioReview,
        htmlArtifact: round.htmlArtifact,
        sameTopicProgress: round.sameTopicProgress,
        difficultySignal: round.difficultySignal,
      },
    });
  } catch (error) {
    console.error('Voice submission error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Voice submission failed: ${message}` },
      { status: 500 }
    );
  }
}
