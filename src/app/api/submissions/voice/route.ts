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
 * Voice submission endpoint — streams evaluation via SSE
 * Step 1: Upload audio + STT (blocking, must complete before eval)
 * Step 2: Send transcription as first SSE event
 * Step 3: Stream LLM evaluation deltas
 * Step 4: Send validated result, persist in background
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

    const arrayBuffer = await audioFile.arrayBuffer();

    // Run blob storage upload + STT + profile context in parallel
    const audioBlob = new Blob([arrayBuffer], { type: audioFile.type });

    let speakerId: string | undefined;
    const [blobResult, transcriptionResult, profileResult] = await Promise.all([
      // Blob storage upload (non-blocking)
      process.env.BLOB_READ_WRITE_TOKEN
        ? put(
            `recordings/${Date.now()}-${Math.random().toString(36).slice(2)}.webm`,
            Buffer.from(arrayBuffer),
            { access: 'public', contentType: audioFile.type || 'audio/webm' }
          ).catch(err => {
            console.error('Audio storage failed:', err);
            return null;
          })
        : Promise.resolve(null),

      // STT transcription
      transcribeAudio(audioBlob, { speechKey, speechRegion, language: 'en-US' }),

      // Profile context (parallel with STT)
      (async () => {
        if (!authResult.authenticated) return null;
        const speaker = await prisma.speaker.findFirst({
          where: { accountId: authResult.user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!speaker) return null;
        speakerId = speaker.id;
        return buildProfileContext(speaker.id);
      })(),
    ]);

    const audioUrl = blobResult?.url;

    // Handle STT errors
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
        data: { transcription: '', status: 'no_match', audioUrl },
      });
    }

    const transcribedText = transcriptionResult.text;

    // Skip evaluation if requested
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

    // Build prompt
    const llm = getLLMProvider();
    const vocabWords = topicData.suggestedVocab?.map((v: { word: string }) => v.word) || [];
    const profileContext = profileResult;

    // Build prompt and create stream based on type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stream: AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; data: any }>;

    if (topicData.type === 'translation') {
      const prompt = buildTranslationEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.keyPoints || [],
        transcribedText,
        vocabWords,
        undefined,
        profileContext || undefined
      );
      stream = llm.streamJSON(prompt, TranslationEvaluationSchema, TRANSLATION_EVALUATION_SYSTEM_PROMPT);
    } else {
      const grammarPoints = topicData.grammarHints?.map((g: { point: string }) => g.point) || [];
      const prompt = buildExpressionEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.guidingQuestions || [],
        transcribedText,
        vocabWords,
        grammarPoints,
        undefined,
        profileContext || undefined
      );
      stream = llm.streamJSON(prompt, ExpressionEvaluationSchema, EXPRESSION_EVALUATION_SYSTEM_PROMPT);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send transcription immediately so client can display it
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'transcription',
              transcription: transcribedText,
              confidence: transcriptionResult.confidence,
              duration: transcriptionResult.duration,
              audioUrl,
            })}\n\n`)
          );

          for await (const event of stream) {
            if (event.type === 'delta') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: event.text })}\n\n`)
              );
            } else if (event.type === 'done') {
              const evaluation = event.data;

              // Calculate overall score
              let overallScore: number;
              if ('semanticAccuracy' in evaluation && 'naturalness' in evaluation) {
                const e = evaluation as { semanticAccuracy: { score: number }; naturalness: { score: number }; grammar: { score: number }; vocabulary: { score: number } };
                overallScore = Math.round(
                  e.semanticAccuracy.score * 0.4 +
                  e.naturalness.score * 0.2 +
                  e.grammar.score * 0.2 +
                  e.vocabulary.score * 0.2
                );
              } else {
                const e = evaluation as { relevance: { score: number }; depth: { score: number }; creativity: { score: number }; languageQuality: { score: number } };
                overallScore = Math.round(
                  e.relevance.score * 0.25 +
                  e.depth.score * 0.25 +
                  e.creativity.score * 0.25 +
                  e.languageQuality.score * 0.25
                );
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'done',
                  data: {
                    transcription: transcribedText,
                    confidence: transcriptionResult.confidence,
                    duration: transcriptionResult.duration,
                    evaluation,
                    overallScore,
                    inputMethod: 'voice',
                    audioUrl,
                  },
                })}\n\n`)
              );
              controller.close();

              // Fire-and-forget: DB persistence
              persistVoiceSubmission({
                authResult,
                topicId,
                sessionId,
                speakerId,
                audioUrl,
                transcribedText,
                topicData,
                evaluation: evaluation as Record<string, unknown>,
                overallScore,
              }).catch(err => console.error('Background persistence error:', err));
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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

// Persist voice submission to database in the background
async function persistVoiceSubmission(params: {
  authResult: { authenticated: boolean; user: { id: string } | null };
  topicId?: string | null;
  sessionId?: string | null;
  speakerId?: string;
  audioUrl?: string;
  transcribedText: string;
  topicData: { type: string; suggestedVocab?: { word: string }[] };
  evaluation: Record<string, unknown>;
  overallScore: number;
}) {
  const {
    authResult, topicId, sessionId, speakerId, audioUrl,
    transcribedText, topicData, evaluation, overallScore,
  } = params;

  if (!authResult.authenticated || !authResult.user || !topicId) return;

  const userId = authResult.user.id;

  try {
    const previousAttempts = await prisma.submission.count({
      where: { topicId, accountId: userId },
    });

    const submission = await prisma.submission.create({
      data: {
        topicId,
        accountId: userId,
        speakerId,
        attemptNumber: previousAttempts + 1,
        inputMethod: 'voice',
        rawAudioUrl: audioUrl,
        transcribedText,
        evaluation: evaluation as object,
        difficultyAssessment: {
          overallScore,
          estimatedCefr: (evaluation as { overallCefrEstimate?: string }).overallCefrEstimate,
        },
      },
    });

    const evalTyped = evaluation as {
      type?: string;
      grammar?: { errors: { original: string; corrected: string; rule: string; severity: string }[] };
      languageQuality?: { grammarErrors: { original: string; corrected: string; rule: string; severity: string }[] };
    };

    const grammarErrors = evalTyped.type === 'translation'
      ? evalTyped.grammar?.errors
      : evalTyped.languageQuality?.grammarErrors;

    const suggestedVocab = topicData.suggestedVocab || [];
    const usedVocabWords = suggestedVocab.filter(vocab =>
      transcribedText.toLowerCase().includes(vocab.word.toLowerCase())
    );

    const cefrEstimate = (evaluation as { overallCefrEstimate?: string }).overallCefrEstimate;

    await Promise.all([
      grammarErrors && grammarErrors.length > 0
        ? prisma.grammarError.createMany({
            data: grammarErrors.map(error => ({
              submissionId: submission.id,
              speakerId,
              errorPattern: error.rule,
              originalText: error.original,
              correctedText: error.corrected,
              severity: error.severity,
            })),
          })
        : Promise.resolve(),
      usedVocabWords.length > 0
        ? prisma.vocabularyUsage.createMany({
            data: usedVocabWords.map(vocab => ({
              submissionId: submission.id,
              speakerId,
              word: vocab.word,
              wasFromHint: true,
              usedCorrectly: true,
              cefrLevel: cefrEstimate,
            })),
          })
        : Promise.resolve(),
      speakerId
        ? prisma.speaker.update({
            where: { id: speakerId },
            data: { lastActiveAt: new Date() },
          })
        : Promise.resolve(),
    ]);

    // Memory system
    let activeSessionId = sessionId || undefined;
    if (!activeSessionId) {
      try {
        const session = await getOrCreateSessionForTopic(userId, topicId, speakerId);
        activeSessionId = session.id;
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }

    if (activeSessionId) {
      const evaluationSummary = topicData.type === 'translation'
        ? `Score: ${overallScore}/100. ${(evaluation as { semanticAccuracy?: { comment?: string } }).semanticAccuracy?.comment || ''} ${(evaluation as { naturalness?: { comment?: string } }).naturalness?.comment || ''}`
        : `Score: ${overallScore}/100. ${(evaluation as { relevance?: { comment?: string } }).relevance?.comment || ''} ${(evaluation as { depth?: { comment?: string } }).depth?.comment || ''}`;

      await Promise.all([
        addMessage({
          sessionId: activeSessionId,
          role: 'user',
          content: transcribedText,
          contentType: 'text',
          metadata: { inputMethod: 'voice', audioUrl },
        }),
        addMessage({
          sessionId: activeSessionId,
          role: 'assistant',
          content: evaluationSummary,
          contentType: 'evaluation',
          metadata: {
            overallScore,
            estimatedCefr: cefrEstimate as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | undefined,
            evaluationType: topicData.type as 'translation' | 'expression',
          },
        }),
      ]);
    }
  } catch (err) {
    console.error('Voice submission persistence error:', err);
  }
}
