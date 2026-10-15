'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// Magic links open in Safari instead of the installed Home Screen PWA (iOS
// treats the link tap as a fresh browser navigation, not an in-app one), so
// this is a 6-digit email code instead: send a code via signInWithOtp,
// verify it via verifyOtp. shouldCreateUser: false means only the two
// accounts created manually in the Supabase dashboard can ever get in —
// this page can't be used to self-register a third.
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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

  const sendCode = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setStep('code');
      setMessage({ text: `Code sent to ${email.trim()}`, isError: false });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to send code', isError: true });
    } finally {
      setBusy(false);
    }
  }, [email]);

  const verifyCode = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      // refresh() so middleware re-evaluates this navigation against the
      // session that verifyOtp just wrote to cookies, instead of the
      // pre-login redirect decision it made on the way in.
      router.replace(next);
      router.refresh();
    } catch (err) {
      setMessage({ text: err.message || 'Invalid or expired code', isError: true });
    } finally {
      setBusy(false);
    }
  }, [email, code, next, router]);

  const changeEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setMessage(null);
  }, []);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Sign in</h1>
      </div>

      <div className="card">
        {step === 'email' ? (
          <form onSubmit={sendCode}>
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

            {message && (
              <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
            )}

            <button
              type="submit"
              className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`}
              disabled={busy || !email.trim()}
            >
              {busy && <span className="btn-spinner" />}
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <div className="section-title">6-digit code</div>
            <div className="form-hint">Sent to {email.trim()} — check your email.</div>
            <div className="form-row">
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                required
                autoFocus
              />
            </div>

            {message && (
              <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
            )}

            <button
              type="submit"
              className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`}
              disabled={busy || code.trim().length !== 6}
            >
              {busy && <span className="btn-spinner" />}
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" className="quiet-btn" onClick={changeEmail} style={{ marginTop: '12px' }}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
