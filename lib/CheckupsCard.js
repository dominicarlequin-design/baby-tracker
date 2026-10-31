'use client';

// Checkups card (Upcoming screen) and its "Mark done" sheet. Schedule and
// status math live in lib/checkups.js; visits are stored in baby_checkups
// (migration 0009).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { localDateStr } from './logic';
import { useSheetViewport, keepFocusedFieldVisible } from './useSheetViewport';
import { checkupTimeline, nextCheckup } from './checkups';

const STATUS_TEXT = { done: 'Done', due: 'Due now', missed: 'Not logged', upcoming: 'Upcoming' };

export const fmtDay = (ymd) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${ymd}T12:00:00Z`));

export function useCheckups(birthDate, timezone) {
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('baby_checkups').select('*');
    if (error) console.error(error);
    else setRecords(data || []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  const today = localDateStr(new Date(), timezone || 'America/New_York');
  const timeline = useMemo(() => checkupTimeline(birthDate, records, today), [birthDate, records, today]);
  return { timeline, next: nextCheckup(timeline), loaded, reload: load, today };
}

export function CheckupsCard({ birthDate, timezone }) {
  const { timeline, next, loaded, reload, today } = useCheckups(birthDate, timezone);
  const [editing, setEditing] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (!birthDate) {
    return (
      <div className="card checkups-card">
        <div className="section-title">Checkups</div>
        <div className="form-hint">Add her birth date in Profile to see her checkup schedule.</div>
      </div>
    );
  }
  if (!loaded) return null;

  // Past and done visits collapse; the next couple stay visible.
  const nextIdx = next ? timeline.findIndex(c => c.key === next.key) : timeline.length;
  const visible = showAll ? timeline : timeline.filter((c, i) => i >= nextIdx && i <= nextIdx + 1);

  return (
    <div className="card checkups-card">
      <div className="section-title">Checkups</div>
      {visible.map(c => (
        <button key={c.key} type="button" className={`checkup-row checkup-${c.status}`} onClick={() => setEditing(c)}>
          <span className="checkup-text">
            <span className="checkup-label">{c.title} checkup</span>
            <span className="checkup-sub">
              {c.status === 'done'
                ? `Done ${fmtDay(c.record.visit_date)}${c.record.notes ? ` · ${c.record.notes}` : ''}`
                : `Around ${fmtDay(c.due)}`}
            </span>
          </span>
          <span className={`checkup-chip checkup-chip-${c.status}`}>{STATUS_TEXT[c.status]}</span>
        </button>
      ))}
      <button type="button" className="checkup-toggle" onClick={() => setShowAll(v => !v)}>
        {showAll ? 'Show less' : 'Show all checkups'}
      </button>
      <div className="form-hint checkup-hint">Ages from the American Academy of Pediatrics. Her pediatrician sets the exact dates and vaccines.</div>

      <CheckupSheet
        checkup={editing}
        today={today}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
    </div>
  );
}

function CheckupSheet({ checkup, today, onClose, onSaved }) {
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);
  useSheetViewport(Boolean(checkup), overlayRef);

  useEffect(() => {
    if (!checkup) return;
    setDate(checkup.record?.visit_date || (checkup.due <= today ? today : checkup.due));
    setNotes(checkup.record?.notes || '');
    setBusy(false);
    setError(null);
  }, [checkup, today]);

  if (!checkup) return null;

  const save = async () => {
    if (!date) { setError('Pick the visit date.'); return; }
    setBusy(true);
    const { error: e } = await supabase.from('baby_checkups')
      .upsert({ key: checkup.key, visit_date: date, notes: notes.trim() || null }, { onConflict: 'key' });
    if (e) { console.error(e); setError("Couldn't save. Try again."); setBusy(false); return; }
    onSaved();
  };
  const undo = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('baby_checkups').delete().eq('key', checkup.key);
    if (e) { console.error(e); setError("Couldn't remove it. Try again."); setBusy(false); return; }
    onSaved();
  };

  return (
    <div className="modal-overlay journal-overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal journal-sheet" role="dialog" aria-label={`${checkup.title} checkup`} onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-head">
          <div className="milk-sheet-grabber" aria-hidden="true" />
          <div className="milk-sheet-head">
            <h2 className="milk-sheet-title">{checkup.title} checkup</h2>
            <button type="button" className="milk-sheet-close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="journal-sheet-body" onFocus={keepFocusedFieldVisible}>
          <label className="form-label" htmlFor="checkup-date">Visit date</label>
          <input id="checkup-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <label className="form-label" htmlFor="checkup-notes">Vaccines and notes (optional)</label>
          <textarea
            id="checkup-notes"
            className="form-input handoff-textarea"
            rows={3}
            maxLength={500}
            placeholder="e.g. Shots given, weight 15 lb 2 oz, next visit at 9 months"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <div className="journal-sheet-foot">
          {error && <div className="form-message error">{error}</div>}
          <button type="button" className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`} onClick={save} disabled={busy}>
            {busy && <span className="btn-spinner" />}
            {checkup.record ? 'Save changes' : 'Mark done'}
          </button>
          {checkup.record && (
            <button type="button" className="modal-btn-delete" onClick={undo} disabled={busy}>Mark not done</button>
          )}
        </div>
      </div>
    </div>
  );
}
