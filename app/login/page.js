'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// Email + password via signInWithPassword — no email round-trip, so no
// magic-link-opens-in-Safari problem to work around. Only the two accounts
// created manually in the Supabase dashboard exist at all (new signups are
// disabled there), so there's no separate "who's allowed" check needed here.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }
  const [next, setNext] = useState('/');

  // Read straight from the URL instead of useSearchParams() — avoids the
  // Suspense boundary Next.js otherwise wants for that hook, and this page
  // has no server-rendered content that needs it any earlier than mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get('next') || '/');
  }, []);

  const signIn = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // refresh() so middleware re-evaluates this navigation against the
      // session signInWithPassword just wrote to cookies, instead of the
      // pre-login redirect decision it made on the way in.
      router.replace(next);
      router.refresh();
    } catch (err) {
      setMessage({ text: err.message || 'Invalid email or password', isError: true });
    } finally {
      setBusy(false);
    }
  }, [email, password, next, router]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Sign in</h1>
      </div>

      <div className="card">
        <form onSubmit={signIn}>
          <div className="section-title">Email</div>
          <div className="form-row">
            <input
              className="form-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="section-title" style={{ marginTop: '16px' }}>Password</div>
          <div className="form-row">
            <input
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
          )}

          <button
            type="submit"
            className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`}
            disabled={busy || !email.trim() || !password}
          >
            {busy && <span className="btn-spinner" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
