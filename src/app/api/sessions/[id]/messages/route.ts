import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { getSession, addMessage, getMessages } from '@/lib/memory/ConversationManager';
import type { ApiResponse } from '@/types';
import type { ChatMessage, MessageMetadata } from '@/lib/memory/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Request body schema for adding a message
const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  contentType: z.enum(['text', 'evaluation']).optional().default('text'),
  metadata: z.object({
    inputMethod: z.enum(['voice', 'text']).optional(),
    audioUrl: z.string().optional(),
    transcriptionConfidence: z.number().optional(),
    overallScore: z.number().optional(),
    estimatedCefr: z.string().optional(),
    evaluationType: z.enum(['translation', 'expression']).optional(),
    systemMessageType: z.enum(['topic_context', 'profile_injection', 'context_summary']).optional(),
  }).optional(),
});

// Query params schema for listing messages
const ListMessagesSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * POST /api/sessions/[id]/messages - Add a message to a session
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id: sessionId } = await params;

    // Verify session exists and user owns it
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    if (session.status === 'ended') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot add messages to an ended session' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = AddMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { role, content, contentType, metadata } = parsed.data;

    const message = await addMessage({
      sessionId,
      role,
      content,
      contentType,
      metadata: metadata as MessageMetadata,
    });

    return NextResponse.json<ApiResponse<ChatMessage>>({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error('Add message error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to add message: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sessions/[id]/messages - Get messages for a session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id: sessionId } = await params;

    // Verify session exists and user owns it
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ListMessagesSchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: `Invalid parameters: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { limit, offset } = parsed.data;

    const messages = await getMessages(sessionId, { limit, offset });

    return NextResponse.json<ApiResponse<{ messages: ChatMessage[]; total: number }>>({
      success: true,
      data: {
        messages,
        total: session.messageCount,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get messages: ${message}` },
      { status: 500 }
    );
  }
}
