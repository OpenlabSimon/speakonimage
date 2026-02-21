import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import type { ApiResponse } from '@/types';

/**
 * GET /api/user/submissions
 * Get authenticated user's submissions with pagination
 */
export async function GET(request: NextRequest) {
  // Require authentication
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const topicId = searchParams.get('topicId'); // Filter by specific topic

    const skip = (page - 1) * limit;

    // Build where clause
    const where: { accountId: string; topicId?: string } = {
      accountId: authResult.user.id,
    };
    if (topicId) {
      where.topicId = topicId;
    }

    // Get submissions with topic info
    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          topic: {
            select: {
              id: true,
              type: true,
              originalInput: true,
              topicContent: true,
            },
          },
          grammarErrors: true,
          vocabularyUsage: true,
        },
      }),
      prisma.submission.count({ where }),
    ]);

    return NextResponse.json<ApiResponse<{
      submissions: typeof submissions;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>>({
      success: true,
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get user submissions error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get submissions: ${message}` },
      { status: 500 }
    );
  }
}
