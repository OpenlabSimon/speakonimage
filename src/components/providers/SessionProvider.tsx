'use client';

import { useEffect, useRef } from 'react';
import { SessionProvider as NextAuthSessionProvider, signIn, useSession } from 'next-auth/react';

function AutoAnonymousSession() {
  const { status } = useSession();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated') {
      attemptedRef.current = false;
      return;
    }

    if (status === 'unauthenticated' && !attemptedRef.current) {
      attemptedRef.current = true;
      void signIn('anonymous', { redirect: false });
    }
  }, [status]);

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
