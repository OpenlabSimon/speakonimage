import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
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

// Request body schema
const SubmissionRequestSchema = z.object({
  topicId: z.string().uuid().optional(), // Topic ID from database
  sessionId: z.string().uuid().optional(), // Chat session ID for memory
  topicType: z.enum(['translation', 'expression']),
  topicContent: z.object({
    chinesePrompt: z.string(),
    keyPoints: z.array(z.string()).optional(),
    guidingQuestions: z.array(z.string()).optional(),
    suggestedVocab: z.array(z.object({
      word: z.string(),
      phonetic: z.string(),
      partOfSpeech: z.string(),
      chinese: z.string(),
      exampleContext: z.string(),
    })),
    grammarHints: z.array(z.object({
      point: z.string(),
      explanation: z.string(),
      pattern: z.string(),
      example: z.string(),
    })).optional(),
  }),
  userResponse: z.string().min(1),
  inputMethod: z.enum(['voice', 'text']),
  historyAttempts: z.array(z.object({
    text: z.string(),
    score: z.number(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SubmissionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { topicId, sessionId, topicType, topicContent, userResponse, inputMethod, historyAttempts } = parsed.data;

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

    // Get LLM provider
    const llm = getLLMProvider();

    // Extract vocab words for prompt
    const vocabWords = topicContent.suggestedVocab.map(v => v.word);

    // Build profile context for personalized feedback
    let profileContext: string | null = null;
    let speakerId: string | undefined;
    if (authResult.authenticated) {
      const speaker = await prisma.speaker.findFirst({
        where: { accountId: authResult.user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (speaker) {
        speakerId = speaker.id;
        profileContext = await buildProfileContext(speaker.id);
      }
    }

    // Build the prompt and create stream based on type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stream: AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; data: any }>;

    if (topicType === 'translation') {
      const prompt = buildTranslationEvaluationPrompt(
        topicContent.chinesePrompt,
        topicContent.keyPoints || [],
        userResponse,
        vocabWords,
        historyAttempts,
        profileContext || undefined
      );
      stream = llm.streamJSON(prompt, TranslationEvaluationSchema, TRANSLATION_EVALUATION_SYSTEM_PROMPT);
    } else {
      const grammarPoints = topicContent.grammarHints?.map(g => g.point) || [];
      const prompt = buildExpressionEvaluationPrompt(
        topicContent.chinesePrompt,
        topicContent.guidingQuestions || [],
        userResponse,
        vocabWords,
        grammarPoints,
        historyAttempts,
        profileContext || undefined
      );
      stream = llm.streamJSON(prompt, ExpressionEvaluationSchema, EXPRESSION_EVALUATION_SYSTEM_PROMPT);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
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

              // Send validated result to client immediately
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'done',
                  data: {
                    evaluation,
                    overallScore,
                    inputMethod,
                  },
                })}\n\n`)
              );
              controller.close();

              // Fire-and-forget: DB persistence after response is sent
              persistSubmission({
                authResult,
                topicId,
                sessionId,
                speakerId,
                inputMethod,
                userResponse,
                topicContent,
                topicType,
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
    console.error('Submission evaluation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Evaluation failed: ${message}` },
      { status: 500 }
    );
  }
}

// Persist submission to database in the background (after streaming response)
async function persistSubmission(params: {
  authResult: { authenticated: boolean; user: { id: string } | null };
  topicId?: string;
  sessionId?: string;
  speakerId?: string;
  inputMethod: string;
  userResponse: string;
  topicContent: { suggestedVocab: { word: string }[] };
  topicType: string;
  evaluation: Record<string, unknown>;
  overallScore: number;
}) {
  const {
    authResult, topicId, sessionId, speakerId, inputMethod,
    userResponse, topicContent, topicType, evaluation, overallScore,
  } = params;

  if (!authResult.authenticated || !authResult.user || !topicId) return;

  const userId = authResult.user.id;

  try {
    // Count + create submission in parallel where possible
    const previousAttempts = await prisma.submission.count({
      where: { topicId, accountId: userId },
    });

    const submission = await prisma.submission.create({
      data: {
        topicId,
        accountId: userId,
        speakerId,
        attemptNumber: previousAttempts + 1,
        inputMethod,
        transcribedText: userResponse,
        evaluation: evaluation as object,
        difficultyAssessment: {
          overallScore,
          estimatedCefr: (evaluation as { overallCefrEstimate?: string }).overallCefrEstimate,
        },
      },
    });

    // Grammar errors and vocabulary usage in parallel
    const evalTyped = evaluation as {
      type?: string;
      grammar?: { errors: { original: string; corrected: string; rule: string; severity: string }[] };
      languageQuality?: { grammarErrors: { original: string; corrected: string; rule: string; severity: string }[] };
    };

    const grammarErrors = evalTyped.type === 'translation'
      ? evalTyped.grammar?.errors
      : evalTyped.languageQuality?.grammarErrors;

    const usedVocabWords = topicContent.suggestedVocab.filter(vocab =>
      userResponse.toLowerCase().includes(vocab.word.toLowerCase())
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
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      try {
        const session = await getOrCreateSessionForTopic(userId, topicId, speakerId);
        activeSessionId = session.id;
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }

    if (activeSessionId) {
      const evaluationSummary = topicType === 'translation'
        ? `Score: ${overallScore}/100. ${(evaluation as { semanticAccuracy?: { comment?: string } }).semanticAccuracy?.comment || ''} ${(evaluation as { naturalness?: { comment?: string } }).naturalness?.comment || ''}`
        : `Score: ${overallScore}/100. ${(evaluation as { relevance?: { comment?: string } }).relevance?.comment || ''} ${(evaluation as { depth?: { comment?: string } }).depth?.comment || ''}`;

      await Promise.all([
        addMessage({
          sessionId: activeSessionId,
          role: 'user',
          content: userResponse,
          contentType: 'text',
          metadata: { inputMethod: inputMethod as 'voice' | 'text' },
        }),
        addMessage({
          sessionId: activeSessionId,
          role: 'assistant',
          content: evaluationSummary,
          contentType: 'evaluation',
          metadata: {
            overallScore,
            estimatedCefr: cefrEstimate as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | undefined,
            evaluationType: topicType as 'translation' | 'expression',
          },
        }),
      ]);
    }
  } catch (err) {
    console.error('Submission persistence error:', err);
  }
}
