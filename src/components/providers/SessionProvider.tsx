'use client';

import { useEffect, useRef } from 'react';
import { SessionProvider as NextAuthSessionProvider, signIn, useSession } from 'next-auth/react';

function AutoAnonymousSession() {
  const { status } = useSession();
  const attemptedRef = useRef(false);
  const autoAnonymousEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_ANONYMOUS_SESSION === 'true';

  useEffect(() => {
    if (!autoAnonymousEnabled) {
      attemptedRef.current = false;
      return;
    }

    if (status === 'authenticated') {
      attemptedRef.current = false;
      return;
    }

    if (status === 'unauthenticated' && !attemptedRef.current) {
      attemptedRef.current = true;
      void signIn('anonymous', { redirect: false }).then((result) => {
        if (result?.error) {
          console.error('Anonymous session init failed:', result.error);
        }
      }).catch((error) => {
        console.error('Anonymous session init failed:', error);
      });
    }
  }, [autoAnonymousEnabled, status]);

  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <AutoAnonymousSession />
      {children}
    </NextAuthSessionProvider>
  );
}
