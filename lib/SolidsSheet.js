'use client';

// "Log solids" bottom sheet, opened from the Solids card on Today. Logs a
// baby_events row with type 'solid', a food_name and an optional
// food_reaction (migration 0007). Feeds, sleep and alerts never read solid
// rows, so this can't disturb them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc } from './logic';
import { useSheetViewport, keepFocusedFieldVisible } from './useSheetViewport';
import { EVENTS_CHANGED } from './logText';
import {
  FOOD_MAX, REACTIONS, STARTER_FOODS, WATCH_DAYS, foodKey, isCommonAllergen, normalizeFood,
} from './solids';

const CHIP_LIMIT = 8;

export function SolidsSheet({ open, onClose, timezone, foods, onSaved }) {
  const [food, setFood] = useState('');
  const [reaction, setReaction] = useState(null);
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [timeEdited, setTimeEdited] = useState(false);
  const [phase, setPhase] = useState(null); // null | 'loading' | 'success'
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  useSheetViewport(open, overlayRef);
  useEffect(() => () => clearTimeout(closeTimeoutRef.current), []);

  // Fresh form each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setFood('');
    setReaction(null);
    setNote('');
    setTimeEdited(false);
    setPhase(null);
    setError(null);
    setTime(isoToLocalDatetimeInputValue(new Date().toISOString(), timezone));
  }, [open, timezone]);

  const chips = useMemo(
    () => (foods && foods.length ? foods.map(f => f.name) : STARTER_FOODS).slice(0, CHIP_LIMIT),
    [foods],
  );
  const known = useMemo(() => new Set((foods || []).map(f => f.key)), [foods]);

  if (!open) return null;

  const clean = normalizeFood(food);
  const isNew = clean && !known.has(foodKey(clean));
  const allergen = clean && isCommonAllergen(clean);

  const submit = async () => {
    if (!clean) { setError("Type what she ate first."); return; }
    if (clean.length > FOOD_MAX) { setError(`Keep the name under ${FOOD_MAX} characters.`); return; }
    let eventTime = new Date().toISOString();
    if (timeEdited && time) {
      const [d, t] = time.split('T');
      eventTime = localDateTimeToUtc(d, t, timezone).toISOString();
    }
    setError(null);
    setPhase('loading');
    const { data, error: insErr } = await supabase
      .from('baby_events')
      .insert({
        type: 'solid',
        food_name: clean,
        food_reaction: reaction,
        note: normalizeFood(note) || null,
        event_time: eventTime,
      })
      .select()
      .single();
    if (insErr) {
      console.error(insErr);
      setPhase(null);
      setError("Couldn't save. Check your connection and try again.");
      return;
    }
    setPhase('success');
    window.dispatchEvent(new Event(EVENTS_CHANGED));
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
      onSaved?.(data);
    }, 500);
  };

  return (
    <div className="modal-overlay journal-overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal journal-sheet" role="dialog" aria-label="Log solids" onClick={e => e.stopPropagation()}>
        <div className="journal-sheet-head">
          <div className="milk-sheet-grabber" aria-hidden="true" />
          <div className="milk-sheet-head">
            <h2 className="milk-sheet-title">Log solids</h2>
            <button type="button" className="milk-sheet-close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="journal-sheet-body" onFocus={keepFocusedFieldVisible}>
          <label className="form-label" htmlFor="solid-food">What did she eat?</label>
          <input
            id="solid-food"
            className="form-input"
            type="text"
            maxLength={FOOD_MAX}
            autoCapitalize="sentences"
            enterKeyHint="done"
            placeholder="e.g. Pumpkin, Banana, Oatmeal"
            value={food}
            onChange={e => { setFood(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
          <div className="custom-chips" role="group" aria-label={foods && foods.length ? 'Foods she has tried' : 'Common first foods'}>
            {chips.map(c => (
              <button
                key={c}
                type="button"
                className={`journal-filter${foodKey(clean) === foodKey(c) ? ' is-on' : ''}`}
                onClick={() => { setFood(c); setError(null); }}
              >
                {c}
              </button>
            ))}
          </div>
          {clean && (
            <div className="solids-hint" aria-live="polite">
              {isNew
                ? `New food. Day 1 of ${WATCH_DAYS}: wait ${WATCH_DAYS} days before the next new one.`
                : 'Tried before.'}
              {allergen && ' This is a common allergen: try it early in the day so you can watch her, and ask her pediatrician if unsure.'}
            </div>
          )}

          <div className="form-label" id="solid-reaction-label">How did she react? (optional)</div>
          <div className="solids-reactions" role="radiogroup" aria-labelledby="solid-reaction-label">
            {Object.entries(REACTIONS).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={reaction === key}
                className={`solids-reaction solids-reaction-${key}${reaction === key ? ' is-on' : ''}`}
                onClick={() => setReaction(reaction === key ? null : key)}
              >
                {text}
              </button>
            ))}
          </div>
          {reaction === 'strong' && (
            <div className="solids-hint solids-hint-alert" role="alert">
              Call her pediatrician before offering this again. Swelling of the face or lips, or trouble breathing: call 911.
            </div>
          )}

          <label className="form-label" htmlFor="solid-note">Note (optional)</label>
          <input
            id="solid-note"
            className="form-input"
            type="text"
            placeholder="How much, how she liked it"
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          <label className="form-label" htmlFor="solid-time">When</label>
          <input
            id="solid-time"
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
            {phase === 'success' ? 'Logged' : clean ? `Log "${clean}"` : 'Log it'}
          </button>
        </div>
      </div>
    </div>
  );
}
