'use client';

// Handoff note (migration 0008): one parent leaves a short note that sits at
// the top of the other parent's Today until they tap "Got it". Only the
// newest unseen note matters, so that's all this loads.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { PARENT_NAMES, parentName } from './logText';
import { useSheetViewport, keepFocusedFieldVisible } from './useSheetViewport';
import { formatRelative } from './homeUi';

export const NOTE_MAX = 280;

// The other family account's first name ("Ysa" for Dom, "Dom" for Ysa).
export function otherParentName(email) {
  const other = Object.keys(PARENT_NAMES).find(e => e !== String(email || '').toLowerCase());
  return other ? PARENT_NAMES[other] : 'them';
}

export function useHandoff(email) {
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('baby_handoff').select('*')
      .is('seen_at', null).order('created_at', { ascending: false }).limit(1);
    if (error) { console.error(error); return; }
    setNote(data?.[0] || null);
  }, []);

  useEffect(() => {
    if (!email) return undefined;
    load();
    const channel = supabase
      .channel('baby-handoff-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_handoff' }, () => load())
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [email, load]);

  const mine = Boolean(note && email && note.created_by === email);

  const send = useCallback(async (text) => {
    const clean = text.trim();
    if (note && mine) {
      const { error } = await supabase.from('baby_handoff').update({ note: clean }).eq('id', note.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('baby_handoff').insert({ note: clean });
      if (error) throw error;
    }
    await load();
  }, [note, mine, load]);

  const clear = useCallback(async () => {
    if (!note) return;
    const { error } = await supabase.from('baby_handoff').delete().eq('id', note.id);
    if (error) throw error;
    await load();
  }, [note, load]);

  const markSeen = useCallback(async () => {
    if (!note) return;
    setNote(null);
    const { error } = await supabase.from('baby_handoff').update({ seen_at: new Date().toISOString() }).eq('id', note.id);
    if (error) { console.error(error); load(); }
  }, [note, load]);

  return { note, mine, send, clear, markSeen };
}

// The other parent's note, at the top of Today.
export function HandoffBanner({ note, now, onSeen }) {
  return (
    <div className="handoff-banner" role="status">
      <div className="handoff-banner-head">
        <span className="handoff-banner-eyebrow">Note from {parentName(note.created_by) || 'the other parent'}</span>
        <span className="handoff-banner-time">{formatRelative(note.created_at, now)}</span>
      </div>
      <p className="handoff-banner-text">{note.note}</p>
      <button type="button" className="handoff-seen-btn" onClick={onSeen}>Got it</button>
    </div>
  );
}

// The row under the tiles: "Leave a note for Ysa", or your own note waiting
// to be seen.
export function HandoffRow({ note, mine, partner, onOpen }) {
  return (
    <button type="button" className={`handoff-row${mine ? ' is-mine' : ''}`} onClick={onOpen}>
      <svg className="handoff-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5.5h16v10H9l-5 4z" />
      </svg>
      <span className="handoff-row-text">
        {mine ? (
          <>
            <span className="handoff-row-title">Your note for {partner} · not seen yet</span>
            <span className="handoff-row-sub">{note.note}</span>
          </>
        ) : (
          <span className="handoff-row-title">Leave a note for {partner}</span>
        )}
      </span>
    </button>
  );
}

export function HandoffSheet({ open, onClose, initial, partner, canClear, onSend, onClear }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);
  useSheetViewport(open, overlayRef);

  useEffect(() => {
    if (open) { setText(initial || ''); setError(null); setBusy(false); }
  }, [open, initial]);

  if (!open) return null;
  const clean = text.trim();

  const submit = async () => {
    if (!clean) { setError('Write something first.'); return; }
    setBusy(true);
    try { await onSend(clean); onClose(); } catch (e) { console.error(e); setError("Couldn't send. Check your connection and try again."); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await onClear(); onClose(); } catch (e) { console.error(e); setError("Couldn't clear it. Try again."); setBusy(false); }
  };

  return (
    <div className="modal-overlay journal-overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal journal-sheet" role="dialog" aria-label={`Note for ${partner}`} onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-head">
          <div className="milk-sheet-grabber" aria-hidden="true" />
          <div className="milk-sheet-head">
            <h2 className="milk-sheet-title">Note for {partner}</h2>
            <button type="button" className="milk-sheet-close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="journal-sheet-body" onFocus={keepFocusedFieldVisible}>
          <label className="form-label" htmlFor="handoff-text">It shows on {partner}&apos;s Today until they tap Got it.</label>
          <textarea
            id="handoff-text"
            className="form-input handoff-textarea"
            rows={4}
            maxLength={NOTE_MAX}
            placeholder="e.g. Gave Tylenol at 11. She's fussy, try the pacifier."
            value={text}
            onChange={e => { setText(e.target.value); setError(null); }}
          />
          <div className="handoff-count">{clean.length}/{NOTE_MAX}</div>
        </div>
        <div className="journal-sheet-foot">
          {error && <div className="form-message error">{error}</div>}
          <button type="button" className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`} onClick={submit} disabled={busy}>
            {busy && <span className="btn-spinner" />}
            {canClear ? 'Update note' : `Send to ${partner}`}
          </button>
          {canClear && (
            <button type="button" className="modal-btn-delete" onClick={remove} disabled={busy}>Clear note</button>
          )}
        </div>
      </div>
    </div>
  );
}
