'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toFormState(config) {
  return {
    birth_date: config.birth_date || '',
    timezone: config.timezone || 'America/New_York',
    medicine_times_local: (config.medicine_times_local || []).join(', '),
    medicine_grace_minutes: String(config.medicine_grace_minutes ?? 15),
    target_bedtime_local: config.target_bedtime_local ?? '19:15',
    overdue_multiplier: String(config.overdue_multiplier ?? 1.25),
    feed_fallback_hours: String(config.feed_fallback_hours ?? 3),
    diaper_fallback_hours: String(config.diaper_fallback_hours ?? 3),
    wake_window_fallback_hours: String(config.wake_window_fallback_hours ?? 1.5),
  };
}

// Turns the form's strings back into the typed values the API route
// validates against. Returns null for a field that doesn't parse, so the
// submit handler can flag it instead of sending garbage.
function parseField(key, value) {
  if (key === 'medicine_times_local') {
    const times = value.split(',').map(t => t.trim()).filter(Boolean);
    return times.length && times.every(t => TIME_RE.test(t)) ? times : null;
  }
  if (key === 'timezone' || key === 'target_bedtime_local') {
    return value.trim() || null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const FIELDS = [
  { key: 'timezone', label: 'Timezone', type: 'text', hint: 'IANA name, e.g. America/New_York' },
  { key: 'medicine_times_local', label: 'Medicine times', type: 'text', hint: 'Comma-separated 24h times, e.g. 08:00, 16:00, 00:00' },
  { key: 'medicine_grace_minutes', label: 'Medicine grace (minutes)', type: 'number', step: '1' },
  { key: 'target_bedtime_local', label: 'Target bedtime', type: 'time' },
  { key: 'overdue_multiplier', label: 'Overdue multiplier', type: 'number', step: '0.05', hint: 'e.g. 1.25 = overdue at 125% of the usual gap' },
  { key: 'feed_fallback_hours', label: 'Feed fallback (hours)', type: 'number', step: '0.1', hint: 'Used until enough feed history exists' },
  { key: 'diaper_fallback_hours', label: 'Diaper fallback (hours)', type: 'number', step: '0.1' },
  { key: 'wake_window_fallback_hours', label: 'Wake window fallback (hours)', type: 'number', step: '0.1' },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }

  useEffect(() => {
    supabase.from('baby_config').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) {
        console.error(error);
        setMessage({ text: 'Failed to load settings', isError: true });
      } else if (data) {
        setForm(toFormState(data));
      }
      setLoading(false);
    });
  }, []);

  const setField = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    // birth_date is optional (unlike everything in FIELDS) and lives
    // outside that loop below: a blank value clears it rather than
    // failing validation, since not every family wants the age-based
    // Patterns comparisons and the field starts empty for them.
    const birthDateInput = form.birth_date.trim();
    if (birthDateInput && !DATE_RE.test(birthDateInput)) {
      setMessage({ text: '"Birth date" isn\'t valid', isError: true });
      return;
    }
    const update = { birth_date: birthDateInput || null };
    for (const { key } of FIELDS) {
      const parsed = parseField(key, form[key]);
      if (parsed == null) {
        setMessage({ text: `"${FIELDS.find(f => f.key === key).label}" isn't valid`, isError: true });
        return;
      }
      update[key] = parsed;
    }

    setSaving(true);
    setMessage(null);
    try {
      // baby_config has a public RLS update policy (same as baby_events'),
      // so this goes straight through the anon client.
      const { data, error } = await supabase
        .from('baby_config')
        .update(update)
        .eq('id', 1)
        .select()
        .single();
      if (error) throw error;
      setForm(toFormState(data));
      setMessage({ text: 'Saved', isError: false });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || 'Failed to save — try again', isError: true });
    } finally {
      setSaving(false);
    }
  }, [form]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Settings</h1>
        <Link href="/" className="header-datetime">Back to Log</Link>
      </div>

      {loading || !form ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <div className="card">
          <div className="section-title">About her</div>
          <div className="form-row">
            <label className="form-label" htmlFor="birth_date">Birth date</label>
            <input
              id="birth_date"
              className="form-input"
              type="date"
              value={form.birth_date}
              onChange={e => setField('birth_date', e.target.value)}
            />
            <div className="form-hint">Powers the age-based "How she compares" ranges on Patterns — they move to the next bracket automatically as she grows. Leave blank and it falls back to a generic 3–5 month range.</div>
          </div>

          <div className="section-title" style={{ marginTop: '20px' }}>Tuning</div>
          {FIELDS.map(f => (
            <div key={f.key} className="form-row">
              <label className="form-label" htmlFor={f.key}>{f.label}</label>
              <input
                id={f.key}
                className="form-input"
                type={f.type}
                step={f.step}
                value={form[f.key]}
                onChange={e => setField(f.key, e.target.value)}
              />
              {f.hint && <div className="form-hint">{f.hint}</div>}
            </div>
          ))}

          {message && (
            <div className={`form-message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>
          )}

          <button className="modal-btn-confirm form-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
