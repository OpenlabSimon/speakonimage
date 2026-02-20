import { NextRequest, NextResponse } from 'next/server';
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
import type { ApiResponse } from '@/types';

/**
 * Voice submission endpoint
 * Accepts audio file + topic data, returns transcription + evaluation
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

    // Get Azure credentials
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Azure Speech credentials not configured' },
        { status: 500 }
      );
    }

    // Step 1: Transcribe audio
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: audioFile.type });

    const transcriptionResult = await transcribeAudio(audioBlob, {
      speechKey,
      speechRegion,
      language: 'en-US',
    });

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
      }>>({
        success: true,
        data: {
          transcription: '',
          status: 'no_match',
        },
      });
    }

    const transcribedText = transcriptionResult.text;

    // Check if evaluation is requested (skipEvaluation can be used for transcription-only)
    const skipEvaluation = formData.get('skipEvaluation') === 'true';

    if (skipEvaluation) {
      return NextResponse.json<ApiResponse<{
        transcription: string;
        confidence: number | undefined;
        duration: number | undefined;
        status: 'success';
      }>>({
        success: true,
        data: {
          transcription: transcribedText,
          confidence: transcriptionResult.confidence,
          duration: transcriptionResult.duration,
          status: 'success',
        },
      });
    }

    // Step 2: Evaluate the transcription
    const llm = getLLMProvider();
    const vocabWords = topicData.suggestedVocab?.map((v: { word: string }) => v.word) || [];

    let evaluation;

    if (topicData.type === 'translation') {
      const prompt = buildTranslationEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.keyPoints || [],
        transcribedText,
        vocabWords
      );

      evaluation = await llm.generateJSON(
        prompt,
        TranslationEvaluationSchema,
        TRANSLATION_EVALUATION_SYSTEM_PROMPT
      );
    } else {
      const grammarPoints = topicData.grammarHints?.map((g: { point: string }) => g.point) || [];
      const prompt = buildExpressionEvaluationPrompt(
        topicData.chinesePrompt,
        topicData.guidingQuestions || [],
        transcribedText,
        vocabWords,
        grammarPoints
      );

      evaluation = await llm.generateJSON(
        prompt,
        ExpressionEvaluationSchema,
        EXPRESSION_EVALUATION_SYSTEM_PROMPT
      );
    }

    // Calculate overall score
    let overallScore: number;
    if (evaluation.type === 'translation') {
      overallScore = Math.round(
        evaluation.semanticAccuracy.score * 0.4 +
        evaluation.naturalness.score * 0.2 +
        evaluation.grammar.score * 0.2 +
        evaluation.vocabulary.score * 0.2
      );
    } else {
      overallScore = Math.round(
        evaluation.relevance.score * 0.25 +
        evaluation.depth.score * 0.25 +
        evaluation.creativity.score * 0.25 +
        evaluation.languageQuality.score * 0.25
      );
    }

    return NextResponse.json<ApiResponse<{
      transcription: string;
      confidence: number | undefined;
      duration: number | undefined;
      evaluation: typeof evaluation;
      overallScore: number;
      inputMethod: 'voice';
    }>>({
      success: true,
      data: {
        transcription: transcribedText,
        confidence: transcriptionResult.confidence,
        duration: transcriptionResult.duration,
        evaluation,
        overallScore,
        inputMethod: 'voice',
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
