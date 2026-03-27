import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { DraftHistorySchema, type DraftHistoryEntry } from '@/lib/drafts';
import type { ApiResponse } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const DraftHistoryRequestSchema = z.object({
  draftHistory: DraftHistorySchema,
});

function normalizeDraftHistory(value: unknown): DraftHistoryEntry[] {
  const parsed = DraftHistorySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function extractTopicDraftHistory(topicContent: unknown): DraftHistoryEntry[] {
  if (!topicContent || typeof topicContent !== 'object' || Array.isArray(topicContent)) {
    return [];
  }

  return normalizeDraftHistory((topicContent as { draftHistory?: unknown }).draftHistory);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;

    const topic = await prisma.topic.findUnique({
      where: { id },
      select: {
        accountId: true,
        topicContent: true,
      },
    });

    if (!topic) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      );
    }

    if (topic.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json<ApiResponse<DraftHistoryEntry[]>>({
      success: true,
      data: extractTopicDraftHistory(topic.topicContent),
    });
  } catch (error) {
    console.error('Get topic draft history error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get draft history: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const authResult = await checkAuth();
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = DraftHistoryRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const existingTopic = await prisma.topic.findUnique({
      where: { id },
      select: { accountId: true, topicContent: true },
    });

    if (!existingTopic) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      );
    }

    if (existingTopic.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: {
        topicContent: {
          ...(existingTopic.topicContent && typeof existingTopic.topicContent === 'object' && !Array.isArray(existingTopic.topicContent)
            ? existingTopic.topicContent as Record<string, unknown>
            : {}),
          draftHistory: parsed.data.draftHistory,
        },
      },
      select: {
        topicContent: true,
      },
    });

    return NextResponse.json<ApiResponse<DraftHistoryEntry[]>>({
      success: true,
      data: extractTopicDraftHistory(updatedTopic.topicContent),
    });
  } catch (error) {
    console.error('Update topic draft history error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to update draft history: ${message}` },
      { status: 500 }
    );
  }
}
