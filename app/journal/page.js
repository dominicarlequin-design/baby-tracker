'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc } from '../../lib/logic';

// Text-only, same as the diaper-detail picker's Pee/Poop/Both — no emoji,
// matching the rest of this app's icon set (sticker glyphs, never emoji).
const MOODS = [
  { key: 'happy', label: 'Happy' },
  { key: 'calm', label: 'Calm' },
  { key: 'fussy', label: 'Fussy' },
  { key: 'sick', label: 'Sick' },
  { key: 'milestone', label: 'Milestone' },
];

// Reached from the new Journal button on Today (app/page.js), a half-width
// sibling of Medicine rather than a 6th logged category — this is a
// free-text note with an optional mood tag, not a one-tap timestamp like
// Fed/Diaper/etc., so it gets its own page instead of a quick-log popup.
export default function JournalPage() {
  const [timezone, setTimezone] = useState('America/New_York');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('');
  const [entryValue, setEntryValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let tz = 'America/New_York';
      try {
        // Raced against a timeout rather than just try/caught: a rejected
        // request falls into the catch below either way, but a request
        // that hangs instead of failing outright (a dead/slow connection,
        // not just a refused one) would otherwise leave "When" blank and
        // Save disabled indefinitely with no error to catch.
        const { data, error } = await Promise.race([
          supabase.from('baby_config').select('timezone').eq('id', 1).single(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 4000)),
        ]);
        if (!error && data?.timezone) tz = data.timezone;
      } catch (err) {
        console.error(err);
        // Falls back to America/New_York below rather than leaving the
        // "When" field permanently blank/disabled if this fetch fails —
        // same reasoning as the try/catch around handleSave.
      }
      if (cancelled) return;
      setTimezone(tz);
      setEntryValue(isoToLocalDatetimeInputValue(new Date().toISOString(), tz));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    if (!note.trim() || !entryValue) {
      setMessage({ text: 'Write a note before saving.', isError: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const [datePart, timePart] = entryValue.split('T');
      const entryTimeIso = localDateTimeToUtc(datePart, timePart, timezone).toISOString();
      const { error } = await supabase.from('baby_journal').insert({
        title: title.trim() || null,
        note: note.trim(),
        mood: mood || null,
        entry_time: entryTimeIso,
      });
      if (error) throw error;
      setSaveJustSucceeded(true);
      setTimeout(() => {
        router.push('/');
      }, 700);
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || 'Failed to save — try again', isError: true });
      setSaveFailed(true);
      setTimeout(() => setSaveFailed(false), 1100);
    } finally {
      setSaving(false);
    }
  }, [note, title, mood, entryValue, timezone, router]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Journal</h1>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/" className="header-datetime">Back to Today</Link>
        </div>
      </div>

      <Link href="/journal/digest" className="stateful-btn outline journal-btn" style={{ marginBottom: '12px' }}>
        <span className="icon-disc" aria-hidden="true">
          <svg className="icon-glyph" viewBox="0 0 24 24">
            <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="3.3" y="14.3" width="4" height="6.7" rx="1" />
            <rect fill="#6fb7c9" stroke="#366f7d" strokeWidth="0.8" x="3.3" y="14.3" width="4" height="6.7" rx="1" />
            <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="9.8" y="10.3" width="4" height="10.7" rx="1" />
            <rect fill="#5fa8d8" stroke="#2f5d80" strokeWidth="0.8" x="9.8" y="10.3" width="4" height="10.7" rx="1" />
            <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="16.3" y="5.3" width="4" height="15.7" rx="1" />
            <rect fill="#4fae6e" stroke="#2c6b42" strokeWidth="0.8" x="16.3" y="5.3" width="4" height="15.7" rx="1" />
          </svg>
        </span>
        <span className="stateful-text">
          <span className="stateful-label">Weekly digest</span>
          <span className="stateful-sub">review &amp; share this week's entries</span>
        </span>
        <span className="stateful-chevron" aria-hidden="true">&rsaquo;</span>
      </Link>

      <div className="card">
        <div className="section-title">New entry</div>

        <label className="form-label" htmlFor="journal-title">Title (optional)</label>
        <input
          id="journal-title"
          className="form-input"
          type="text"
          placeholder="e.g. First time rolling over"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ marginBottom: '14px' }}
        />

        <label className="form-label" htmlFor="journal-note">Note</label>
        <textarea
          id="journal-note"
          className="form-input form-textarea"
          placeholder="What happened?"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ marginBottom: '14px' }}
        />

        <div className="form-label">Mood (optional)</div>
        <div className="mood-grid" style={{ marginBottom: '14px' }}>
          {MOODS.map(m => (
            <button
              key={m.key}
              type="button"
              className={`picker-btn ${mood === m.key ? 'selected' : ''}`}
              onClick={() => setMood(mood === m.key ? '' : m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="form-label" htmlFor="journal-time">When</label>
        <input
          id="journal-time"
          className="form-input"
          type="datetime-local"
          value={entryValue}
          onChange={e => setEntryValue(e.target.value)}
          disabled={loading}
        />

        <button
          className={`modal-btn-confirm form-save ${saving ? 'is-loading' : ''} ${saveJustSucceeded ? 'is-success' : ''} ${saveFailed ? 'is-error' : ''}`}
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving && <span className="btn-spinner" />}
          {saveJustSucceeded && <svg className="btn-check" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
          {saving ? 'Saving…' : 'Save entry'}
        </button>
        {message && (
          <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
        )}
      </div>

      <TabBar active="journal" />
    </div>
  );
}
