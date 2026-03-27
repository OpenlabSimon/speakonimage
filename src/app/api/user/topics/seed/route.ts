import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { DraftHistorySchema } from '@/lib/drafts';
import type { ApiResponse } from '@/types';

const DifficultyScoreSchema = z
  .preprocess((value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) return undefined;

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }, z.number().optional())
  .transform((value) => {
    const normalized = value ?? 0.5;
    return Math.min(1, Math.max(0, normalized));
  });

const SeedTopicRequestSchema = z.object({
  type: z.enum(['translation', 'expression']),
  originalInput: z.string().min(1).max(500),
  topicContent: z.object({
    chinesePrompt: z.string().min(1),
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
    difficultyMetadata: z.object({
      targetCefr: z.string(),
      vocabComplexity: DifficultyScoreSchema,
      grammarComplexity: DifficultyScoreSchema,
    }),
    seedDraft: z.string().optional(),
    seedDraftLabel: z.string().optional(),
    practiceGoal: z.string().optional(),
  }),
  difficultyMetadata: z.object({
    targetCefr: z.string(),
    vocabComplexity: DifficultyScoreSchema,
    grammarComplexity: DifficultyScoreSchema,
  }).optional(),
  draftHistory: DraftHistorySchema.optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const parsed = SeedTopicRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { type, originalInput, topicContent, difficultyMetadata, draftHistory } = parsed.data;

    const topic = await prisma.topic.create({
      data: {
        accountId: authResult.user.id,
        type,
        originalInput,
        topicContent: {
          ...topicContent,
          draftHistory: draftHistory ?? [],
        },
        difficultyMetadata: difficultyMetadata ?? topicContent.difficultyMetadata,
      },
    });

    return NextResponse.json<ApiResponse<typeof topicContent & { id: string }>>({
      success: true,
      data: {
        id: topic.id,
        ...topicContent,
      },
    });
  } catch (error) {
    console.error('Seed topic error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to create topic: ${message}` },
      { status: 500 }
    );
  }
}
