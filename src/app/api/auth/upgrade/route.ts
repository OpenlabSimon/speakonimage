import { auth } from '@/lib/auth';
import { upgradeGuestAccount } from '@/lib/auth/guest';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (!session.user.isGuest) {
    return Response.json(
      { success: false, error: 'Account is not a guest account' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const user = await upgradeGuestAccount(session.user.id, { email, password });

    return Response.json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upgrade failed';
    return Response.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
