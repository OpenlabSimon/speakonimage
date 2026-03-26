import { NextRequest, NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/llm';
import { resolveBackgroundLLMModel } from '@/lib/llm/model-selection';
import { isValidCharacterId } from '@/lib/characters';
import { normalizeOpenAICompatibleBaseUrl, readCleanEnvValue } from '@/lib/env-utils';
import {
  PracticeGameSchema,
  buildPracticeGameSystemPrompt,
  buildPracticeGameUserPrompt,
} from '@/lib/llm/prompts/generate-practice-game';

interface PracticeGameRequest {
  characterId: string;
  topicType: string;
  chinesePrompt: string;
  userResponse: string;
  evaluation: Record<string, unknown>;
  cefrLevel: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PracticeGameRequest = await request.json();
    const { characterId, topicType, chinesePrompt, userResponse, evaluation, cefrLevel } = body;

    // Validate required fields
    if (!characterId || !isValidCharacterId(characterId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing characterId' },
        { status: 400 }
      );
    }

    if (!topicType || !chinesePrompt || !userResponse || !evaluation || !cefrLevel) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use higher temperature and longer timeout for HTML game generation
    const geminiKey = readCleanEnvValue('GEMINI_API_KEY');
    if (!geminiKey) {
      return NextResponse.json(
        { success: false, error: 'LLM provider not configured' },
        { status: 500 }
      );
    }

    const llm = new GeminiProvider({
      apiKey: geminiKey,
      baseUrl: normalizeOpenAICompatibleBaseUrl(process.env.GEMINI_BASE_URL),
      model: resolveBackgroundLLMModel(),
      temperature: 0.9,
      maxRetries: 1,
      timeoutMs: 60000,
    });

    const systemPrompt = buildPracticeGameSystemPrompt(characterId);
    const userPrompt = buildPracticeGameUserPrompt({
      chinesePrompt,
      userResponse,
      cefrLevel,
      topicType,
      evaluation,
    });

    const result = await llm.generateJSON(
      userPrompt,
      PracticeGameSchema,
      systemPrompt
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Practice game generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Practice game generation failed',
      },
      { status: 500 }
    );
  }
}
