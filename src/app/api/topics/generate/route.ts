import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getLLMProvider } from '@/lib/llm';
import {
  TranslationTopicSchema,
  ExpressionTopicSchema,
  buildTopicPrompt,
  getSystemPromptForType,
  type TopicGenerationOutput,
} from '@/lib/llm/prompts/topic-generate';
import type { ApiResponse } from '@/types';

// Request body schema
const RequestSchema = z.object({
  text: z.string().min(1).max(2000).describe('Topic keywords or content to generate from'),
  type: z.enum(['translation', 'expression']).default('translation'),
  targetCefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional().default('B1'),
  accountId: z.string().uuid().optional(), // Will be from auth later
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { text, type, targetCefr, accountId } = parsed.data;

    // Get LLM provider
    const llm = getLLMProvider();

    // Build prompt and get schema based on topic type
    const prompt = buildTopicPrompt(type, text, targetCefr);
    const systemPrompt = getSystemPromptForType(type);

    // Use the appropriate schema based on type
    let topicData: TopicGenerationOutput;
    if (type === 'translation') {
      topicData = await llm.generateJSON(prompt, TranslationTopicSchema, systemPrompt);
    } else {
      topicData = await llm.generateJSON(prompt, ExpressionTopicSchema, systemPrompt);
    }

    // If accountId provided, save to database
    let topicId: string | undefined;
    if (accountId) {
      const topic = await prisma.topic.create({
        data: {
          accountId,
          type,
          originalInput: text,
          topicContent: topicData as object,
          difficultyMetadata: topicData.difficultyMetadata,
        },
      });
      topicId = topic.id;
    }

    return NextResponse.json<ApiResponse<TopicGenerationOutput & { id?: string }>>({
      success: true,
      data: {
        ...topicData,
        id: topicId,
      },
    });
  } catch (error) {
    console.error('Topic generation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Topic generation failed: ${message}` },
      { status: 500 }
    );
  }
}
