import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import type { ApiResponse } from '@/types';

/**
 * GET /api/user/stats
 * Get authenticated user's learning statistics
 */
export async function GET() {
  // Require authentication
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const userId = authResult.user.id;

    // Get various stats in parallel
    const [
      totalTopics,
      totalSubmissions,
      recentSubmissions,
      grammarErrorStats,
      speaker,
    ] = await Promise.all([
      // Total topics created
      prisma.topic.count({ where: { accountId: userId } }),

      // Total submissions
      prisma.submission.count({ where: { accountId: userId } }),

      // Recent submissions with scores (last 10)
      prisma.submission.findMany({
        where: { accountId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          difficultyAssessment: true,
          inputMethod: true,
          topic: {
            select: { type: true },
          },
        },
      }),

      // Top grammar error patterns
      prisma.grammarError.groupBy({
        by: ['errorPattern'],
        where: {
          submission: { accountId: userId },
        },
        _count: { errorPattern: true },
        orderBy: { _count: { errorPattern: 'desc' } },
        take: 5,
      }),

      // Get user's speaker profile
      prisma.speaker.findFirst({
        where: { accountId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          languageProfile: true,
          lastActiveAt: true,
        },
      }),
    ]);

    // Calculate average score from recent submissions
    const scores = recentSubmissions
      .map(s => (s.difficultyAssessment as { overallScore?: number } | null)?.overallScore)
      .filter((s): s is number => typeof s === 'number');
    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    // Count by topic type
    const translationCount = recentSubmissions.filter(s => s.topic.type === 'translation').length;
    const expressionCount = recentSubmissions.filter(s => s.topic.type === 'expression').length;

    // Count by input method
    const voiceCount = recentSubmissions.filter(s => s.inputMethod === 'voice').length;
    const textCount = recentSubmissions.filter(s => s.inputMethod === 'text').length;

    return NextResponse.json<ApiResponse<{
      totalTopics: number;
      totalSubmissions: number;
      averageScore: number | null;
      recentScores: number[];
      topGrammarErrors: { pattern: string; count: number }[];
      practiceBreakdown: {
        translation: number;
        expression: number;
        voice: number;
        text: number;
      };
      languageProfile: unknown;
      lastActiveAt: Date | null;
    }>>({
      success: true,
      data: {
        totalTopics,
        totalSubmissions,
        averageScore,
        recentScores: scores,
        topGrammarErrors: grammarErrorStats.map(e => ({
          pattern: e.errorPattern,
          count: e._count.errorPattern,
        })),
        practiceBreakdown: {
          translation: translationCount,
          expression: expressionCount,
          voice: voiceCount,
          text: textCount,
        },
        languageProfile: speaker?.languageProfile || null,
        lastActiveAt: speaker?.lastActiveAt || null,
      },
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get stats: ${message}` },
      { status: 500 }
    );
  }
}
