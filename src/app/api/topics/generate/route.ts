import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  getLLMProvider,
} from '@/lib/llm';
import {
  resolveFastLLMModel,
  resolveTopicGenerationModel,
} from '@/lib/llm/model-selection';
import {
  TranslationTopicSchema,
  ExpressionTopicSchema,
  TopicGenerationSchema,
  UNIFIED_SYSTEM_PROMPT,
  buildTopicPrompt,
  buildUnifiedPrompt,
  getSystemPromptForType,
  type TopicGenerationOutput,
} from '@/lib/llm/prompts/topic-generate';
import { buildTopicPersonalizationContext } from '@/lib/profile/memory';
import type { ApiResponse } from '@/types';

// Request body schema
const RequestSchema = z.object({
  text: z.string().min(1).max(2000).describe('Topic keywords or content to generate from'),
  type: z.enum(['translation', 'expression']).optional(),
  targetCefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional().default('B1'),
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

    const { text, type, targetCefr } = parsed.data;

    // Get authenticated user (optional - topics can be generated without auth)
    const user = await getCurrentUser();
    const speaker = user?.id
      ? await prisma.speaker.findFirst({
          where: { accountId: user.id },
          orderBy: { createdAt: 'asc' },
          select: { languageProfile: true },
        })
      : null;
    const profileContext = buildTopicPersonalizationContext(speaker?.languageProfile);

    // Get LLM provider
    const llm = getLLMProvider('critical');

    // Build prompt and get schema based on topic type
    const topicModel = resolveTopicGenerationModel();
    let topicData: TopicGenerationOutput;

    if (!type) {
      topicData = await llm.generateJSON(
        buildUnifiedPrompt(text, targetCefr, profileContext || undefined),
        TopicGenerationSchema,
        UNIFIED_SYSTEM_PROMPT,
        { model: resolveFastLLMModel() }
      );
    } else if (type === 'translation') {
      topicData = await llm.generateJSON(
        buildTopicPrompt(type, text, targetCefr, profileContext || undefined),
        TranslationTopicSchema,
        getSystemPromptForType(type),
        {
          model: topicModel,
        }
      );
    } else {
      topicData = await llm.generateJSON(
        buildTopicPrompt(type, text, targetCefr, profileContext || undefined),
        ExpressionTopicSchema,
        getSystemPromptForType(type),
        {
          model: topicModel,
        }
      );
    }

    // If user is authenticated, save topic to database
    let topicId: string | undefined;
    if (user?.id) {
      const topic = await prisma.topic.create({
        data: {
          accountId: user.id,
          type: topicData.type,
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
