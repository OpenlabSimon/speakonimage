import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLLMProvider } from '@/lib/llm';
import {
  IntroductionAssessmentSchema,
  buildIntroductionAssessmentPrompt,
  ASSESS_LEVEL_SYSTEM_PROMPT,
  type IntroductionAssessment,
} from '@/lib/llm/prompts/assess-level';
import type { ApiResponse } from '@/types';

// Request body schema
const RequestSchema = z.object({
  introductionText: z
    .string()
    .min(5, 'Introduction must be at least 5 characters')
    .max(2000, 'Introduction must be less than 2000 characters')
    .describe('The user self-introduction text mixing English and Chinese'),
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

    const { introductionText } = parsed.data;

    // Get LLM provider
    const llm = getLLMProvider();

    // Build prompt and call LLM
    const prompt = buildIntroductionAssessmentPrompt(introductionText);
    const assessment = await llm.generateJSON<IntroductionAssessment>(
      prompt,
      IntroductionAssessmentSchema,
      ASSESS_LEVEL_SYSTEM_PROMPT
    );

    return NextResponse.json<ApiResponse<IntroductionAssessment>>({
      success: true,
      data: assessment,
    });
  } catch (error) {
    console.error('Assessment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Assessment failed: ${message}` },
      { status: 500 }
    );
  }
}
