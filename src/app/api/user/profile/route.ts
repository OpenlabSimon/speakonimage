import { NextResponse } from 'next/server';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeAndUpdateProfile } from '@/lib/profile/ProfileManager';
import type { ApiResponse } from '@/types';

/**
 * GET /api/user/profile — compute profile, return profile + recent submissions + top grammar errors
 */
export async function GET() {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse();
    }

    const accountId = authResult.user.id;

    // Get default speaker for this account
    const speaker = await prisma.speaker.findFirst({
      where: { accountId },
      select: { id: true },
    });

    if (!speaker) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No speaker found' },
        { status: 404 }
      );
    }

    // Compute profile (writes to DB) and fetch supporting data in parallel
    const [profile, recentSubmissions, topicCount, submissionCount, activeDays] = await Promise.all([
      computeAndUpdateProfile(speaker.id),
      prisma.submission.findMany({
        where: { speakerId: speaker.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          transcribedText: true,
          evaluation: true,
          difficultyAssessment: true,
          createdAt: true,
          topic: {
            select: { type: true, originalInput: true },
          },
        },
      }),
      prisma.topic.count({ where: { accountId } }),
      prisma.submission.count({ where: { speakerId: speaker.id } }),
      prisma.submission.groupBy({
        by: ['createdAt'],
        where: { speakerId: speaker.id },
        _count: true,
      }),
    ]);

    // Calculate average score from recent submissions
    let avgScore = 0;
    if (recentSubmissions.length > 0) {
      const scores = recentSubmissions
        .map((s) => {
          const eval_ = s.evaluation as Record<string, unknown> | null;
          if (!eval_) return null;
          // Try to get score from difficultyAssessment or calculate from evaluation
          const da = s.difficultyAssessment as { overallScore?: number } | null;
          return da?.overallScore ?? null;
        })
        .filter((s): s is number => s !== null);
      if (scores.length > 0) {
        avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }

    // Count unique active days
    const uniqueDays = new Set(
      activeDays.map((d) =>
        d.createdAt.toISOString().slice(0, 10)
      )
    ).size;

    // Calculate streak (consecutive days ending today/yesterday)
    const daySet = new Set(
      activeDays.map((d) => d.createdAt.toISOString().slice(0, 10))
    );
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (daySet.has(key)) {
        streak++;
      } else if (i === 0) {
        // today might not have activity yet, check yesterday
        continue;
      } else {
        break;
      }
    }

    return NextResponse.json<ApiResponse<{
      profile: typeof profile;
      stats: {
        topicCount: number;
        submissionCount: number;
        avgScore: number;
        streak: number;
        vocabSize: number;
        activeDays: number;
      };
      recentSubmissions: typeof recentSubmissions;
    }>>({
      success: true,
      data: {
        profile,
        stats: {
          topicCount,
          submissionCount,
          avgScore,
          streak,
          vocabSize: profile.vocabularyProfile.uniqueWordCount,
          activeDays: uniqueDays,
        },
        recentSubmissions,
      },
    });
  } catch (error) {
    console.error('Profile API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to load profile: ${message}` },
      { status: 500 }
    );
  }
}
