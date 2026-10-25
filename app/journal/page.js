'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { isoToLocalDatetimeInputValue, localDateStr, localDateTimeToUtc } from '../../lib/logic';
import { formatLocalTime } from '../../lib/homeUi';

// Text-only, same as the diaper-detail picker's Pee/Poop/Both — no emoji,
// matching the rest of this app's icon set (sticker glyphs, never emoji).
const MOODS = [
  { key: 'happy', label: 'Happy' },
  { key: 'calm', label: 'Calm' },
  { key: 'fussy', label: 'Fussy' },
  { key: 'sick', label: 'Sick' },
  { key: 'milestone', label: 'Milestone' },
];
const MOOD_LABELS = Object.fromEntries(MOODS.map(m => [m.key, m.label]));

const ENTRY_LIMIT = 500;
const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request

// Same fetch-with-a-timeout shape as before: a hung request (not just a
// refused one) would otherwise leave this page stuck on "Loading…".
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

// "5 mo", "5 mo 2 wk", "3 wk", "4 days" — her age on the entry's date.
function ageOn(dayStr, birthDate) {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = dayStr.split('-').map(Number);
  const born = Date.UTC(by, bm - 1, bd);
  const on = Date.UTC(y, m - 1, d);
  if (on < born) return null;
  let months = (y - by) * 12 + (m - bm);
  if (d < bd) months -= 1;
  const monthStart = Date.UTC(by, bm - 1 + months, bd);
  const days = Math.round((on - monthStart) / 86400000);
  // Capped at 3 so the last days of a month read "4 mo 3 wk", never "4 mo 4 wk".
  const weeks = Math.min(3, Math.floor(days / 7));
  if (months <= 0) {
    const total = Math.round((on - born) / 86400000);
    return total < 14 ? `${total} ${total === 1 ? 'day' : 'days'}` : `${Math.floor(total / 7)} wk`;
  }
  return weeks > 0 ? `${months} mo ${weeks} wk` : `${months} mo`;
}

function monthLabel(dayStr) {
  const [y, m] = dayStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 15)));
}

function shortDate(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function nextDayStr(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The Journal opens to every past entry, newest first, grouped by month.
// "New entry" (and tapping any entry) opens the same editor sheet. Each
// entry shows her age that day and that day's feeds / diapers / naps.
// Arriving from Today's Journal tile (/journal?new=1) opens the editor
// straight away and returns to Today after saving, like before.
export default function JournalPage() {
  const router = useRouter();
  const [timezone, setTimezone] = useState('America/New_York');
  const [birthDate, setBirthDate] = useState(null);
  const [entries, setEntries] = useState([]);
  const [dayStats, setDayStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [moodFilter, setMoodFilter] = useState('all');

  // Editor sheet: null when closed, otherwise { entry } (entry null = new).
  const [editor, setEditor] = useState(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('');
  const [entryValue, setEntryValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastShow, setToastShow] = useState(false);
  const toastTimeoutRef = useRef(null);
  const fromTodayRef = useRef(false);

  const showToast = useCallback((text) => {
    clearTimeout(toastTimeoutRef.current);
    setToast(text);
    setToastShow(true);
    toastTimeoutRef.current = setTimeout(() => setToastShow(false), 2200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  // Feeds / diapers / naps for each day that has an entry, fetched only for
  // those days (and paged past Supabase's 1000-row cap).
  const loadDayStats = useCallback(async (list, tz) => {
    const days = [...new Set(list.map(e => localDateStr(new Date(e.entry_time), tz)))];
    if (!days.length) { setDayStats({}); return; }
    const ranges = days.map(day => {
      const from = localDateTimeToUtc(day, '00:00', tz).toISOString();
      const to = localDateTimeToUtc(nextDayStr(day), '00:00', tz).toISOString();
      return `and(event_time.gte.${from},event_time.lt.${to})`;
    });
    const stats = {};
    for (let i = 0; i < ranges.length; i += 40) {
      const chunk = ranges.slice(i, i + 40).join(',');
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('baby_events')
          .select('type,event_time')
          .in('type', ['feed', 'diaper', 'nap_start'])
          .or(chunk)
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) { console.error(error); break; }
        for (const ev of data) {
          const day = localDateStr(new Date(ev.event_time), tz);
          const s = (stats[day] ||= { feed: 0, diaper: 0, nap_start: 0 });
          if (ev.type in s) s[ev.type] += 1;
        }
        if (data.length < PAGE_SIZE) break;
      }
    }
    setDayStats(stats);
  }, []);

  const loadAll = useCallback(async () => {
    let tz = 'America/New_York';
    try {
      const [configRes, entriesRes] = await withTimeout(Promise.all([
        supabase.from('baby_config').select('timezone,birth_date').eq('id', 1).single(),
        supabase.from('baby_journal').select('*').order('entry_time', { ascending: false }).limit(ENTRY_LIMIT),
      ]), 6000);
      if (configRes.data?.timezone) tz = configRes.data.timezone;
      setBirthDate(configRes.data?.birth_date || null);
      if (entriesRes.error) throw entriesRes.error;
      setTimezone(tz);
      setEntries(entriesRes.data || []);
      setLoadError(false);
      setLoading(false);
      loadDayStats(entriesRes.data || [], tz);
    } catch (err) {
      console.error(err);
      setTimezone(tz);
      setLoadError(true);
      setLoading(false);
    }
    return tz;
  }, [loadDayStats]);

  const openEditor = useCallback((entry, tz) => {
    setEditor({ entry });
    setTitle(entry?.title || '');
    setNote(entry?.note || '');
    setMood(entry?.mood || '');
    setEntryValue(isoToLocalDatetimeInputValue(entry ? entry.entry_time : new Date().toISOString(), tz));
    setConfirmDelete(false);
    setMessage(null);
  }, []);

  useEffect(() => {
    (async () => {
      const tz = await loadAll();
      // Read the query string directly (not useSearchParams) so the page
      // doesn't need a Suspense boundary for this one flag.
      if (new URLSearchParams(window.location.search).get('new') === '1') {
        fromTodayRef.current = true;
        openEditor(null, tz);
      }
    })();
  }, [loadAll, openEditor]);

  const closeEditor = useCallback(() => {
    setEditor(null);
    setConfirmDelete(false);
    setMessage(null);
    if (fromTodayRef.current) {
      fromTodayRef.current = false;
      window.history.replaceState(null, '', '/journal');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!note.trim() || !entryValue) {
      setMessage('Write a note before saving.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const [datePart, timePart] = entryValue.split('T');
      const row = {
        title: title.trim() || null,
        note: note.trim(),
        mood: mood || null,
        entry_time: localDateTimeToUtc(datePart, timePart, timezone).toISOString(),
      };
      const editing = editor?.entry;
      const { data, error } = editing
        ? await supabase.from('baby_journal').update(row).eq('id', editing.id).select().single()
        : await supabase.from('baby_journal').insert(row).select().single();
      if (error) throw error;
      if (fromTodayRef.current && !editing) {
        router.push('/');
        return;
      }
      const next = (editing ? entries.map(e => (e.id === data.id ? data : e)) : [data, ...entries])
        .sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));
      setEntries(next);
      loadDayStats(next, timezone);
      closeEditor();
      showToast(editing ? 'Entry updated' : 'Entry saved');
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [note, title, mood, entryValue, timezone, editor, entries, router, loadDayStats, closeEditor, showToast]);

  const handleDelete = useCallback(async () => {
    const entry = editor?.entry;
    if (!entry) return;
    // First tap arms it, second tap deletes, so a stray tap can't lose a memory.
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const { error } = await supabase.from('baby_journal').delete().eq('id', entry.id);
      if (error) throw error;
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      closeEditor();
      showToast('Entry deleted');
    } catch (err) {
      console.error(err);
      setMessage('Failed to delete. Try again.');
    } finally {
      setDeleting(false);
    }
  }, [editor, confirmDelete, closeEditor, showToast]);

  // Mood chips only offer moods that actually appear in her entries.
  const moodsInUse = useMemo(() => MOODS.filter(m => entries.some(e => e.mood === m.key)), [entries]);

  const months = useMemo(() => {
    const shown = moodFilter === 'all' ? entries : entries.filter(e => e.mood === moodFilter);
    const groups = [];
    for (const entry of shown) {
      const day = localDateStr(new Date(entry.entry_time), timezone);
      const key = day.slice(0, 7);
      if (groups[groups.length - 1]?.key !== key) groups.push({ key, label: monthLabel(day), items: [] });
      groups[groups.length - 1].items.push({ entry, day });
    }
    return groups;
  }, [entries, moodFilter, timezone]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Journal</h1>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <button type="button" className="modal-btn-confirm form-save journal-new-btn" onClick={() => openEditor(null, timezone)} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        New entry
      </button>

      <Link href="/journal/digest" className="journal-digest-link">
        Weekly digest
        <span className="journal-digest-sub">review &amp; share this week</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </Link>

      {moodsInUse.length > 0 && (
        <div className="journal-filters" role="group" aria-label="Filter by mood">
          {[{ key: 'all', label: 'All' }, ...moodsInUse].map(m => (
            <button
              key={m.key}
              type="button"
              className={`journal-filter${moodFilter === m.key ? ' is-on' : ''}`}
              aria-pressed={moodFilter === m.key}
              onClick={() => setMoodFilter(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : loadError ? (
        <div className="card"><div className="info-item">Couldn&apos;t load entries. Check your connection and reopen Journal.</div></div>
      ) : months.length === 0 ? (
        <div className="card journal-empty">
          {entries.length === 0
            ? 'No entries yet. Tap New entry to write the first one.'
            : `No ${MOOD_LABELS[moodFilter]?.toLowerCase()} entries yet.`}
        </div>
      ) : (
        months.map(month => (
          <section key={month.key} className="journal-month">
            <div className="journal-month-label">{month.label}</div>
            {month.items.map(({ entry, day }) => {
              const age = ageOn(day, birthDate);
              const s = dayStats[day];
              return (
                <button key={entry.id} type="button" className="journal-card" onClick={() => openEditor(entry, timezone)}>
                  <span className="journal-card-head">
                    <span className="journal-card-title">{entry.title || 'Journal entry'}</span>
                    <span className="journal-card-date">{shortDate(day)} · {formatLocalTime(entry.entry_time, timezone)}</span>
                  </span>
                  {(age || entry.mood) && (
                    <span className="journal-card-meta">
                      {entry.mood && <span className={`journal-mood journal-mood-${entry.mood}`}>{MOOD_LABELS[entry.mood] || entry.mood}</span>}
                      {age && <span className="journal-card-age">{age} old</span>}
                    </span>
                  )}
                  <span className="journal-card-note">{entry.note}</span>
                  {s && (
                    <span className="journal-card-stats">
                      {plural(s.feed, 'feed', 'feeds')} · {plural(s.diaper, 'diaper', 'diapers')} · {plural(s.nap_start, 'nap', 'naps')}
                    </span>
                  )}
                </button>
              );
            })}
          </section>
        ))
      )}

      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <span>{toast}</span>
      </div>

      {editor && (
        <div className="modal-overlay" onClick={closeEditor}>
          <div className="modal milk-sheet journal-sheet" role="dialog" aria-label={editor.entry ? 'Edit entry' : 'New entry'} onClick={e => e.stopPropagation()}>
            <div className="milk-sheet-grabber" aria-hidden="true" />
            <div className="milk-sheet-head">
              <h2 className="milk-sheet-title">{editor.entry ? 'Edit entry' : 'New entry'}</h2>
              <button type="button" className="milk-sheet-close" aria-label="Close" onClick={closeEditor}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

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
            />

            <button
              className={`modal-btn-confirm form-save ${saving ? 'is-loading' : ''}`}
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving && <span className="btn-spinner" />}
              {saving ? 'Saving…' : editor.entry ? 'Save changes' : 'Save entry'}
            </button>
            {editor.entry && (
              <button className="modal-btn-delete" onClick={handleDelete} disabled={saving || deleting}>
                {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to delete' : 'Delete entry'}
              </button>
            )}
            {message && <div className="form-message error">{message}</div>}
          </div>
        </div>
      )}

      <TabBar active="journal" />
    </div>
  );
}
