import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { transcribeAudio } from '@/lib/speech/azure-stt';
import { getLLMProvider } from '@/lib/llm';
import {
  TranslationEvaluationSchema,
  TRANSLATION_EVALUATION_SYSTEM_PROMPT,
  buildTranslationEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-translation';
import {
  ExpressionEvaluationSchema,
  EXPRESSION_EVALUATION_SYSTEM_PROMPT,
  buildExpressionEvaluationPrompt,
} from '@/lib/llm/prompts/evaluate-expression';
import {
  getOrCreateSessionForTopic,
  addMessage,
} from '@/lib/memory/ConversationManager';
import { buildProfileContext } from '@/lib/profile/ProfileInjector';
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

      // Verify the topic belongs to this user
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
        // Continue without storage - don't fail the request
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
    const llm = getLLMProvider();
    const vocabWords = topicData.suggestedVocab?.map((v: { word: string }) => v.word) || [];

    // Build profile context for personalized feedback
    let profileContext: string | null = null;
    if (authResult.authenticated) {
      const speaker = await prisma.speaker.findFirst({
        where: { accountId: authResult.user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (speaker) {
        profileContext = await buildProfileContext(speaker.id);
      }
    }

    let evaluation;

    if (topicData.type === 'translation') {
      const prompt = buildTranslationEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.keyPoints || [],
        transcribedText,
        vocabWords,
        undefined, // historyAttempts
        profileContext || undefined
      );

      evaluation = await llm.generateJSON(
        prompt,
        TranslationEvaluationSchema,
        TRANSLATION_EVALUATION_SYSTEM_PROMPT
      );
    } else {
      const grammarPoints = topicData.grammarHints?.map((g: { point: string }) => g.point) || [];
      const prompt = buildExpressionEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.guidingQuestions || [],
        transcribedText,
        vocabWords,
        grammarPoints,
        undefined, // historyAttempts
        profileContext || undefined
      );

      evaluation = await llm.generateJSON(
        prompt,
        ExpressionEvaluationSchema,
        EXPRESSION_EVALUATION_SYSTEM_PROMPT
      );
    }

    // Calculate overall score
    let overallScore: number;
    if (evaluation.type === 'translation') {
      overallScore = Math.round(
        evaluation.semanticAccuracy.score * 0.4 +
        evaluation.naturalness.score * 0.2 +
        evaluation.grammar.score * 0.2 +
        evaluation.vocabulary.score * 0.2
      );
    } else {
      overallScore = Math.round(
        evaluation.relevance.score * 0.25 +
        evaluation.depth.score * 0.25 +
        evaluation.creativity.score * 0.25 +
        evaluation.languageQuality.score * 0.25
      );
    }

    // Step 4: Save to database if user is authenticated and we have a topicId
    let submissionId: string | undefined;
    if (authResult.authenticated && topicId) {
      // Get attempt number (count previous submissions for this topic)
      const previousAttempts = await prisma.submission.count({
        where: {
          topicId,
          accountId: authResult.user.id,
        },
      });

      // Get default speaker for this user
      const speaker = await prisma.speaker.findFirst({
        where: { accountId: authResult.user.id },
        orderBy: { createdAt: 'asc' },
      });

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          topicId,
          accountId: authResult.user.id,
          speakerId: speaker?.id,
          attemptNumber: previousAttempts + 1,
          inputMethod: 'voice',
          rawAudioUrl: audioUrl,
          transcribedText,
          evaluation: evaluation as object,
          difficultyAssessment: {
            overallScore,
            estimatedCefr: evaluation.overallCefrEstimate,
          },
        },
      });

      submissionId = submission.id;

      // Extract and save grammar errors
      const grammarErrors = evaluation.type === 'translation'
        ? evaluation.grammar.errors
        : evaluation.languageQuality.grammarErrors;

      if (grammarErrors && grammarErrors.length > 0) {
        await prisma.grammarError.createMany({
          data: grammarErrors.map(error => ({
            submissionId: submission.id,
            speakerId: speaker?.id,
            errorPattern: error.rule,
            originalText: error.original,
            correctedText: error.corrected,
            severity: error.severity,
          })),
        });
      }

      // Extract and save vocabulary usage (words from suggested vocab that were used)
      const suggestedVocab = topicData.suggestedVocab || [];
      const usedVocabWords = suggestedVocab.filter((vocab: { word: string }) =>
        transcribedText.toLowerCase().includes(vocab.word.toLowerCase())
      );

      if (usedVocabWords.length > 0) {
        await prisma.vocabularyUsage.createMany({
          data: usedVocabWords.map((vocab: { word: string }) => ({
            submissionId: submission.id,
            speakerId: speaker?.id,
            word: vocab.word,
            wasFromHint: true,
            usedCorrectly: true,
            cefrLevel: evaluation.overallCefrEstimate,
          })),
        });
      }

      // Update speaker's last active time
      if (speaker) {
        await prisma.speaker.update({
          where: { id: speaker.id },
          data: { lastActiveAt: new Date() },
        });
      }

      // Add messages to chat session for memory system
      let activeSessionId: string | undefined = sessionId || undefined;

      if (!activeSessionId && topicId) {
        try {
          const session = await getOrCreateSessionForTopic(
            authResult.user.id,
            topicId,
            speaker?.id
          );
          activeSessionId = session.id;
        } catch (err) {
          console.error('Failed to create session:', err);
        }
      }

      if (activeSessionId) {
        try {
          await addMessage({
            sessionId: activeSessionId,
            role: 'user',
            content: transcribedText,
            contentType: 'text',
            metadata: {
              inputMethod: 'voice',
              audioUrl,
            },
          });

          const evaluationSummary = evaluation.type === 'translation'
            ? `Score: ${overallScore}/100. ${evaluation.semanticAccuracy.comment} ${evaluation.naturalness.comment}`
            : `Score: ${overallScore}/100. ${evaluation.relevance.comment} ${evaluation.depth.comment}`;

          await addMessage({
            sessionId: activeSessionId,
            role: 'assistant',
            content: evaluationSummary,
            contentType: 'evaluation',
            metadata: {
              overallScore,
              estimatedCefr: evaluation.overallCefrEstimate,
              evaluationType: topicData.type,
            },
          });
        } catch (err) {
          console.error('Failed to add messages to session:', err);
        }
      }
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
