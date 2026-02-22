import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import { evaluateResponse, getProfileContext, persistSubmission } from '@/lib/evaluation/evaluateSubmission';
import type { ApiResponse } from '@/types';

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

    // Get Azure credentials
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Azure Speech credentials not configured' },
        { status: 500 }
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
      speechKey,
      speechRegion,
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

    // Step 3: Evaluate the transcription
    const profileContext = authResult.authenticated
      ? await getProfileContext(authResult.user.id)
      : null;

    const suggestedVocab = topicData.suggestedVocab || [];

    const { evaluation, overallScore } = await evaluateResponse({
      topicType: topicData.type,
      chinesePrompt: topicData.chinesePrompt,
      keyPoints: topicData.keyPoints,
      guidingQuestions: topicData.guidingQuestions,
      suggestedVocab,
      grammarHints: topicData.grammarHints,
      userResponse: transcribedText,
      inputMethod: 'voice',
      profileContext,
    });

    // Step 4: Save to database if user is authenticated and we have a topicId
    let submissionId: string | undefined;
    if (authResult.authenticated && topicId) {
      const result = await persistSubmission({
        topicId,
        accountId: authResult.user.id,
        inputMethod: 'voice',
        userResponse: transcribedText,
        audioUrl,
        evaluation,
        overallScore,
        topicType: topicData.type,
        suggestedVocab,
        sessionId: sessionId || undefined,
      });
      submissionId = result.submissionId;
    }

    return NextResponse.json<ApiResponse<{
      id?: string;
      transcription: string;
      confidence: number | undefined;
      duration: number | undefined;
      evaluation: typeof evaluation;
      overallScore: number;
      inputMethod: 'voice';
      audioUrl?: string;
    }>>({
      success: true,
      data: {
        id: submissionId,
        transcription: transcribedText,
        confidence: transcriptionResult.confidence,
        duration: transcriptionResult.duration,
        evaluation,
        overallScore,
        inputMethod: 'voice',
        audioUrl,
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
