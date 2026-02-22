import { NextRequest, NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/llm';
import { isValidCharacterId } from '@/lib/characters';
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
  overallScore: number;
  evaluation: Record<string, unknown>;
  cefrLevel: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PracticeGameRequest = await request.json();
    const { characterId, topicType, chinesePrompt, userResponse, overallScore, evaluation, cefrLevel } = body;

    // Validate required fields
    if (!characterId || !isValidCharacterId(characterId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing characterId' },
        { status: 400 }
      );
    }

    if (!topicType || !chinesePrompt || !userResponse || overallScore === undefined || !evaluation || !cefrLevel) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use higher temperature and longer timeout for HTML game generation
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { success: false, error: 'LLM provider not configured' },
        { status: 500 }
      );
    }

    const llm = new GeminiProvider({
      apiKey: geminiKey,
      baseUrl: process.env.GEMINI_BASE_URL || 'https://hiapi.online/v1',
      model: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
      temperature: 0.9,
      maxRetries: 1,
      timeoutMs: 60000,
    });

    const systemPrompt = buildPracticeGameSystemPrompt(characterId);
    const userPrompt = buildPracticeGameUserPrompt({
      chinesePrompt,
      userResponse,
      overallScore,
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
