import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import {
  createSession,
  listSessions,
  getActiveSession,
} from '@/lib/memory/ConversationManager';
import type { ApiResponse } from '@/types';
import type { ChatSession, SessionType } from '@/lib/memory/types';

// Request body schema for creating a session
const CreateSessionSchema = z.object({
  topicId: z.string().uuid().optional(),
  speakerId: z.string().uuid().optional(),
  sessionType: z.enum(['practice', 'review']).optional().default('practice'),
});

// Query params schema for listing sessions
const ListSessionsSchema = z.object({
  status: z.enum(['active', 'ended']).optional(),
  limit: z.coerce.number().min(1).max(50).optional().default(10),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * POST /api/sessions - Create a new chat session
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const body = await request.json();
    const parsed = CreateSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { topicId, speakerId, sessionType } = parsed.data;

    // Check if there's already an active session for this topic
    if (topicId) {
      const existing = await getActiveSession(authResult.user.id, topicId);
      if (existing) {
        return NextResponse.json<ApiResponse<ChatSession>>({
          success: true,
          data: existing,
        });
      }
    }

    const session = await createSession({
      accountId: authResult.user.id,
      speakerId,
      topicId,
      sessionType: sessionType as SessionType,
    });

    return NextResponse.json<ApiResponse<ChatSession>>({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Create session error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to create session: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sessions - List user's chat sessions
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ListSessionsSchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid parameters: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { status, limit, offset } = parsed.data;

    const sessions = await listSessions(authResult.user.id, {
      status: status as 'active' | 'ended' | undefined,
      limit,
      offset,
    });

    return NextResponse.json<ApiResponse<ChatSession[]>>({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error('List sessions error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to list sessions: ${message}` },
      { status: 500 }
    );
  }
}
