import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import type { ApiResponse } from '@/types';

/**
 * GET /api/user/topics
 * Get authenticated user's topics with pagination
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
    const type = searchParams.get('type'); // 'translation' | 'expression' | null

    const skip = (page - 1) * limit;

    // Build where clause
    const where: { accountId: string; type?: string } = {
      accountId: authResult.user.id,
    };
    if (type === 'translation' || type === 'expression') {
      where.type = type;
    }

    // Get topics with submission count
    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: { submissions: true },
          },
        },
      }),
      prisma.topic.count({ where }),
    ]);

    return NextResponse.json<ApiResponse<{
      topics: typeof topics;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>>({
      success: true,
      data: {
        topics,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get user topics error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get topics: ${message}` },
      { status: 500 }
    );
  }
}
