'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('sign-in'); // 'sign-in' | 'sign-up'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }

  const submit = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push('/');
        } else {
          setMessage({ text: 'Account created — check your email to confirm before signing in.', isError: false });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
      }
    } catch (err) {
      setMessage({ text: err.message || 'Something went wrong', isError: true });
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, router]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Baby Tracker</h1>
      </div>
      <div className="card">
        <div className="section-title">{mode === 'sign-up' ? 'Create account' : 'Sign in'}</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="form-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {message && (
            <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
          )}

          <button type="submit" className="modal-btn-confirm form-save" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          type="button"
          className="header-settings-link auth-mode-toggle"
          onClick={() => { setMode(m => (m === 'sign-up' ? 'sign-in' : 'sign-up')); setMessage(null); }}
        >
          {mode === 'sign-up' ? 'Already have an account? Sign in' : "First time? Create an account"}
        </button>
      </div>
    </div>
  );
}
