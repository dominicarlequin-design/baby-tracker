'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// Client-side session gate for every route except /login. Until RLS is
// switched over to require auth.uid(), this doesn't restrict data access on
// its own — baby_events/baby_config are still publicly readable/writable at
// the database level — but it's the UI half of the login flow, and needed
// so the flow can be verified before that switch is flipped.
export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== '/login') router.replace('/login');
    if (session && pathname === '/login') router.replace('/');
  }, [session, pathname, router]);

  if (session === undefined) {
    return (
      <div className="wrap">
        <div className="card"><div className="info-item">Loading…</div></div>
      </div>
    );
  }

  if (!session && pathname !== '/login') {
    return (
      <div className="wrap">
        <div className="card"><div className="info-item">Redirecting to sign in…</div></div>
      </div>
    );
  }

  return children;
}
