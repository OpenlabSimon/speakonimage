import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, unauthorizedResponse } from '@/lib/auth';
import { getSession, endSession } from '@/lib/memory/ConversationManager';
import type { ApiResponse } from '@/types';
import type { ChatSession } from '@/lib/memory/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/[id] - Get session details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id } = await params;
    const session = await getSession(id);

    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json<ApiResponse<ChatSession>>({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Get session error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to get session: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/[id] - End a session
 * This doesn't delete the session, just marks it as ended and triggers extraction
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id } = await params;
    const session = await getSession(id);

    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // End the session (triggers learning data extraction)
    const endedSession = await endSession(id, {
      extractLearningData: true,
      updateProfile: true,
    });

    return NextResponse.json<ApiResponse<ChatSession>>({
      success: true,
      data: endedSession,
    });
  } catch (error) {
    console.error('End session error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to end session: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions/[id] - Update session (e.g., end it)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await checkAuth();
    if (!authResult.authenticated) {
      return unauthorizedResponse('Authentication required');
    }

    const { id } = await params;
    const body = await request.json();

    const session = await getSession(id);

    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (session.accountId !== authResult.user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Handle status change to 'ended'
    if (body.status === 'ended' && session.status === 'active') {
      const endedSession = await endSession(id, {
        extractLearningData: body.extractLearningData !== false,
        updateProfile: body.updateProfile !== false,
      });

      return NextResponse.json<ApiResponse<ChatSession>>({
        success: true,
        data: endedSession,
      });
    }

    // No changes made
    return NextResponse.json<ApiResponse<ChatSession>>({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Update session error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Failed to update session: ${message}` },
      { status: 500 }
    );
  }
}
