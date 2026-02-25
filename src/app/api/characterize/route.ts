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
}

export async function POST(request: NextRequest) {
  try {
    const body: CharacterizeRequest = await request.json();
    const { characterId, overallScore, evaluation, userResponse, topicType, chinesePrompt } = body;

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
    });

    // Stream JSON generation — send deltas as SSE, validated result at end
    const stream = llm.streamJSON(
      userPrompt,
      CharacterFeedbackSchema,
      systemPrompt
    );

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
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'done', data: event.data })}\n\n`)
              );
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
          );
        } finally {
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
