import { NextRequest, NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/llm';
import { isValidCharacterId } from '@/lib/characters';
import {
  CharacterFeedbackSchema,
  buildCharacterizeSystemPrompt,
  buildCharacterizeUserPrompt,
} from '@/lib/llm/prompts/characterize-feedback';

interface CharacterizeRequest {
  characterId: string;
  overallScore: number;
  evaluation: Record<string, unknown>;
  userResponse: string;
  topicType: string;
  chinesePrompt: string;
  inputMethod?: 'voice' | 'text';
}

export async function POST(request: NextRequest) {
  try {
    const body: CharacterizeRequest = await request.json();
    const { characterId, overallScore, evaluation, userResponse, topicType, chinesePrompt, inputMethod } = body;

    // Validate required fields
    if (!characterId || !isValidCharacterId(characterId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing characterId' },
        { status: 400 }
      );
    }

    if (overallScore === undefined || !evaluation || !userResponse || !topicType || !chinesePrompt) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const llm = getLLMProvider();

    const systemPrompt = buildCharacterizeSystemPrompt(characterId);
    const userPrompt = buildCharacterizeUserPrompt({
      overallScore,
      evaluation,
      userResponse,
      topicType,
      chinesePrompt,
      inputMethod,
    });

    const feedback = await llm.generateJSON(
      userPrompt,
      CharacterFeedbackSchema,
      systemPrompt
    );

    return NextResponse.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error('Characterize error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Character feedback generation failed',
      },
      { status: 500 }
    );
  }
}
