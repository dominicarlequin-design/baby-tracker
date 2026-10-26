'use client';

// The center "+" in the tab bar opens this Custom log sheet from any screen
// (Today, History, Insights, Profile). It logs anything with a label of
// your own ("Vitamin D", "Tummy time", "Bath"): a baby_events row with
// type 'custom' and a custom_label (migration 0004). Feeds, sleep, stats
// and alerts only read their own event types, so custom entries never
// affect them; History shows them under their own Custom category.
//
// Replaces the earlier quick-log popup (one-tap Fed / Diaper / Nap /
// Bedtime / Medicine), at Dom's request; those stay on Today's buttons.
//
// The provider name (QuickLogProvider / useQuickLog) is kept so the layout
// and tab bar wiring didn't need to change.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc } from './logic';
import { useSheetViewport, keepFocusedFieldVisible } from './useSheetViewport';
import { useLogSync } from './LogSync';
import { DOUBLE_LOG_MINUTES, EVENTS_CHANGED, findDoubleLog, whoLogged } from './logText';
import { formatRelative } from './homeUi';

const LABEL_MAX = 60;
const RECENT_DAYS = 60;   // how far back to look for label chips
const CHIP_LIMIT = 8;

// Other screens listen for this to refresh after a custom entry is logged
// or undone (History does, so a new entry shows up without a reload).
export { EVENTS_CHANGED };
const announceChange = () => window.dispatchEvent(new Event(EVENTS_CHANGED));

const QuickLogContext = createContext(null);

export function useQuickLog() {
  const ctx = useContext(QuickLogContext);
  if (!ctx) throw new Error('useQuickLog must be used within QuickLogProvider');
  return ctx;
}

const tidy = (text) => text.trim().replace(/\s+/g, ' ');

// Most-used labels first (ties: most recent), case-insensitive.
function topLabels(rows) {
  const byKey = new Map();
  for (const r of rows) {
    if (!r.custom_label) continue;
    const label = tidy(r.custom_label);
    const key = label.toLowerCase();
    const hit = byKey.get(key);
    if (hit) hit.count += 1;
    else byKey.set(key, { label, count: 1, last: r.event_time });
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || new Date(b.last) - new Date(a.last))
    .slice(0, CHIP_LIMIT)
    .map(x => x.label);
}

export function QuickLogProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState('America/New_York');
  const [chips, setChips] = useState([]);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [timeEdited, setTimeEdited] = useState(false);
  const [phase, setPhase] = useState(null); // null | 'loading' | 'success'
  const [error, setError] = useState(null);
  // Set when the same label was logged moments ago; a second tap on Log
  // saves anyway. Holds the label it was shown for.
  const [dupFor, setDupFor] = useState(null);
  const { email } = useLogSync();
  const [toast, setToast] = useState(null); // { text, row }
  const [toastShow, setToastShow] = useState(false);
  const overlayRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  useSheetViewport(open, overlayRef);

  useEffect(() => () => {
    clearTimeout(toastTimeoutRef.current);
    clearTimeout(closeTimeoutRef.current);
  }, []);

  const openQuickLog = useCallback(async () => {
    clearTimeout(closeTimeoutRef.current);
    setLabel('');
    setNote('');
    setTimeEdited(false);
    setPhase(null);
    setError(null);
    setDupFor(null);
    setTime(isoToLocalDatetimeInputValue(new Date().toISOString(), timezone));
    setOpen(true);
    // Chips and timezone load in the background; the sheet is usable at once.
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const [configRes, rowsRes] = await Promise.all([
      supabase.from('baby_config').select('timezone').eq('id', 1).single(),
      supabase.from('baby_events').select('custom_label,event_time').eq('type', 'custom')
        .gte('event_time', since).order('event_time', { ascending: false }).limit(500),
    ]);
    const tz = configRes.data?.timezone;
    if (tz && tz !== timezone) {
      setTimezone(tz);
      setTime(prev => (prev ? isoToLocalDatetimeInputValue(new Date().toISOString(), tz) : prev));
    }
    if (rowsRes.error) console.error(rowsRes.error);
    else setChips(topLabels(rowsRes.data || []));
  }, [timezone]);

  const closeQuickLog = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(false);
  }, []);

  const showToast = useCallback((text, row) => {
    clearTimeout(toastTimeoutRef.current);
    setToast({ text, row });
    setToastShow(true);
    toastTimeoutRef.current = setTimeout(() => setToastShow(false), 4000);
  }, []);

  const undo = useCallback(async () => {
    const row = toast?.row;
    setToastShow(false);
    if (!row) return;
    const { error: delErr } = await supabase.from('baby_events').delete().eq('id', row.id);
    if (delErr) { console.error(delErr); return; }
    announceChange();
  }, [toast]);

  const submit = useCallback(async () => {
    const clean = tidy(label);
    if (!clean) { setError("Type what you're logging first."); return; }
    if (clean.length > LABEL_MAX) { setError(`Keep the label under ${LABEL_MAX} characters.`); return; }
    // An untouched time means "now" at the moment of logging.
    let eventTime = new Date().toISOString();
    if (timeEdited && time) {
      const [d, t] = time.split('T');
      eventTime = localDateTimeToUtc(d, t, timezone).toISOString();
    }
    setError(null);
    setPhase('loading');

    // Double-log check: same label logged (by either parent) within the
    // last few minutes? Warn once; tapping Log again saves anyway.
    if (dupFor !== clean.toLowerCase()) {
      const since = new Date(Date.parse(eventTime) - DOUBLE_LOG_MINUTES.custom * 60000).toISOString();
      const { data: recent } = await supabase.from('baby_events')
        .select('id,type,custom_label,event_time,logged_by').eq('type', 'custom').gte('event_time', since);
      const match = findDoubleLog(recent || [], { type: 'custom', custom_label: clean }, Date.parse(eventTime));
      if (match) {
        setPhase(null);
        setDupFor(clean.toLowerCase());
        setError(`${whoLogged(match.logged_by, email)} logged ${match.custom_label} ${formatRelative(match.event_time, new Date())}. Tap Log again to save it anyway.`);
        return;
      }
    }

    const { data, error: insErr } = await supabase
      .from('baby_events')
      .insert({ type: 'custom', custom_label: clean, note: tidy(note) || null, event_time: eventTime })
      .select()
      .single();
    if (insErr) {
      console.error(insErr);
      setPhase(null);
      setError("Couldn't save. Check your connection and try again.");
      return;
    }
    setPhase('success');
    announceChange();
    // A beat to see the check, then close and confirm with Undo.
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      showToast(`Logged: ${clean}`, data);
    }, 500);
  }, [label, note, time, timeEdited, timezone, showToast, dupFor, email]);

  const cleanLabel = tidy(label);

  return (
    <QuickLogContext.Provider value={{ openQuickLog, closeQuickLog }}>
      {children}

      {open && (
        <div className="modal-overlay journal-overlay" ref={overlayRef} onClick={closeQuickLog}>
          <div className="modal journal-sheet" role="dialog" aria-label="Custom log" onClick={e => e.stopPropagation()}>
            <div className="journal-sheet-head">
              <div className="milk-sheet-grabber" aria-hidden="true" />
              <div className="milk-sheet-head">
                <h2 className="milk-sheet-title">Custom log</h2>
                <button type="button" className="milk-sheet-close" aria-label="Close" onClick={closeQuickLog}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>

            <div className="journal-sheet-body" onFocus={keepFocusedFieldVisible}>
              <label className="form-label" htmlFor="custom-label">What are you logging?</label>
              <input
                id="custom-label"
                className="form-input"
                type="text"
                maxLength={LABEL_MAX}
                autoCapitalize="sentences"
                enterKeyHint="done"
                placeholder="e.g. Vitamin D, Tummy time, Bath"
                value={label}
                onChange={e => { setLabel(e.target.value); setError(null); setDupFor(null); }}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
              {chips.length > 0 && (
                <div className="custom-chips" role="group" aria-label="Recent labels">
                  {chips.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`journal-filter${cleanLabel.toLowerCase() === c.toLowerCase() ? ' is-on' : ''}`}
                      onClick={() => { setLabel(c); setError(null); setDupFor(null); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <label className="form-label" htmlFor="custom-note">Note (optional)</label>
              <input
                id="custom-note"
                className="form-input"
                type="text"
                placeholder="Any detail worth remembering"
                value={note}
                onChange={e => setNote(e.target.value)}
              />

              <label className="form-label" htmlFor="custom-time">When</label>
              <input
                id="custom-time"
                className="form-input"
                type="datetime-local"
                value={time}
                onChange={e => { setTime(e.target.value); setTimeEdited(true); }}
              />
            </div>

            <div className="journal-sheet-foot">
              {error && <div className="form-message error">{error}</div>}
              <button
                type="button"
                className={`modal-btn-confirm form-save ${phase === 'loading' ? 'is-loading' : ''} ${phase === 'success' ? 'is-success' : ''}`}
                onClick={submit}
                disabled={phase !== null}
              >
                {phase === 'loading' && <span className="btn-spinner" />}
                {phase === 'success' && <svg className="btn-check" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
                {phase === 'success' ? 'Logged' : cleanLabel ? `Log "${cleanLabel}"` : 'Log it'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast custom-toast ${toastShow ? 'show' : ''}`} aria-live="polite">
        <span>{toast?.text}</span>
        {toast?.row && (
          <button type="button" className="toast-action" onClick={undo}>Undo</button>
        )}
      </div>
    </QuickLogContext.Provider>
  );
}
