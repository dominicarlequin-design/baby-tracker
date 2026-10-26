'use client';

// Profile. Every change saves on its own (no Save button): switches and
// choices save right away, typed fields save a moment after you stop
// typing or when you leave the field, and the card shows "Saved ✓".
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { getPushStatus, enablePushAlerts, disablePushAlerts } from '../../lib/push';
import { SOUND_STYLES, getSoundSettings, setSoundSettings, previewSound } from '../../lib/sound';
import { dailyMilkTarget } from '../../lib/milk';
import { BABY_NAME, ageLine, formatHours } from '../../lib/homeUi';
import { useLogSync } from '../../lib/LogSync';
import { PARENT_NAMES, parentName } from '../../lib/logText';
import { SKINS, getSkin, applySkin, getMode, applyMode } from '../../lib/skin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SAVE_DELAY_MS = 600;

// "Alert me when she's…" choices for overdue_multiplier.
const LATENESS = [
  { value: 1.15, label: 'A bit late' },
  { value: 1.25, label: 'Late' },
  { value: 1.5, label: 'Very late' },
];

const US_ZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

// Which card shows the "Saved ✓" for each setting.
const CARD_OF = {
  birth_date: 'her', weight_lbs: 'her', target_bedtime_local: 'her',
  overdue_multiplier: 'alerts',
  medicine_times_local: 'medicine', medicine_grace_minutes: 'medicine',
  timezone: 'advanced', feed_fallback_hours: 'advanced', diaper_fallback_hours: 'advanced', wake_window_fallback_hours: 'advanced',
};

// Returns an error message, or null when the value is fine to save.
function problemWith(key, value) {
  switch (key) {
    case 'birth_date': return value === null || DATE_RE.test(value) ? null : 'Pick a valid date';
    case 'weight_lbs': return value === null || (value > 0 && value < 60) ? null : 'Weight should be between 1 and 60 lbs';
    case 'target_bedtime_local': return TIME_RE.test(value || '') ? null : 'Pick a bedtime';
    case 'medicine_times_local': return value.every(t => TIME_RE.test(t)) ? null : 'One of the medicine times is blank';
    case 'overdue_multiplier': return value > 1 ? null : 'Pick how late';
    case 'medicine_grace_minutes': return value >= 0 ? null : 'Must be 0 or more';
    case 'timezone': return value ? null : 'Pick a timezone';
    default: return value > 0 ? null : 'Must be more than 0';
  }
}

function SaveState({ state }) {
  if (!state) return null;
  if (state === 'saving') return <span className="save-state">Saving…</span>;
  if (state === 'saved') {
    return (
      <span className="save-state is-saved">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        Saved
      </span>
    );
  }
  return <span className="save-state is-error">Not saved</span>;
}

// − value + control, so number settings never need the keyboard.
function Stepper({ label, hint, value, step, min, max, format, onChange }) {
  const round = (n) => Math.round(n * 100) / 100;
  return (
    <div className="stepper-row">
      <div className="stepper-text">
        <div className="stepper-label">{label}</div>
        {hint && <div className="stepper-hint">{hint}</div>}
      </div>
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" className="stepper-btn" aria-label={`Less ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(round(Math.max(min, value - step)))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
        </button>
        <span className="stepper-value" aria-live="polite">{format(value)}</span>
        <button type="button" className="stepper-btn" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(round(Math.min(max, value + step)))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { email } = useLogSync();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [weightText, setWeightText] = useState('');
  const [saveState, setSaveState] = useState({}); // card -> 'saving' | 'saved' | 'error'
  const [errors, setErrors] = useState({}); // card -> message
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const savedTimersRef = useRef({});
  const [now, setNow] = useState(() => new Date());

  const [vapidPublicKey, setVapidPublicKey] = useState(null);
  const [pushStatus, setPushStatus] = useState('checking'); // unsupported | ios-needs-install | checking | on | off
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState(null);
  const [pushJustSucceeded, setPushJustSucceeded] = useState(false);
  const [pushFailed, setPushFailed] = useState(false);
  const [soundJustToggled, setSoundJustToggled] = useState(false);
  const [skin, setSkin] = useState('blossom');
  const [mode, setMode] = useState('auto');

  // Starts at the same defaults getSoundSettings() falls back to on the
  // server (no localStorage there), then syncs to whatever's actually
  // saved on this device once mounted — avoids a hydration mismatch.
  const [soundSettings, setSoundSettingsState] = useState({ enabled: true, volume: 0.6, style: 'soft' });

  useEffect(() => {
    supabase.from('baby_config').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) {
        console.error(error);
        setErrors({ her: 'Couldn’t load settings. Check your connection.' });
      } else if (data) {
        setConfig(data);
        setWeightText(data.weight_lbs != null ? String(data.weight_lbs) : '');
        setVapidPublicKey(data.vapid_public_key || null);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { getPushStatus().then(setPushStatus); }, []);
  useEffect(() => { setSoundSettingsState(getSoundSettings()); }, []);
  useEffect(() => { setSkin(getSkin()); setMode(getMode()); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Auto-save -------------------------------------------------------
  // Changes collect for a moment, then go to Supabase in one update.
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const update = pendingRef.current;
    pendingRef.current = {};
    const keys = Object.keys(update);
    if (!keys.length) return;
    const cards = [...new Set(keys.map(k => CARD_OF[k]))];
    setSaveState(prev => ({ ...prev, ...Object.fromEntries(cards.map(c => [c, 'saving'])) }));
    const { data, error } = await supabase.from('baby_config').update(update).eq('id', 1).select().single();
    if (error) {
      console.error(error);
      setSaveState(prev => ({ ...prev, ...Object.fromEntries(cards.map(c => [c, 'error'])) }));
      setErrors(prev => ({ ...prev, ...Object.fromEntries(cards.map(c => [c, 'Couldn’t save. Check your connection and try again.'])) }));
      return;
    }
    setConfig(prev => ({ ...prev, ...Object.fromEntries(keys.map(k => [k, data[k]])) }));
    setSaveState(prev => ({ ...prev, ...Object.fromEntries(cards.map(c => [c, 'saved'])) }));
    for (const c of cards) {
      clearTimeout(savedTimersRef.current[c]);
      savedTimersRef.current[c] = setTimeout(() => setSaveState(prev => ({ ...prev, [c]: prev[c] === 'saved' ? null : prev[c] })), 2000);
    }
  }, []);

  // Save when leaving the page, so a last-second change isn't lost.
  useEffect(() => () => { if (Object.keys(pendingRef.current).length) flush(); }, [flush]);

  const change = useCallback((key, value, { now: immediate = false } = {}) => {
    const card = CARD_OF[key];
    setConfig(prev => ({ ...prev, [key]: value }));
    const problem = problemWith(key, value);
    if (problem) {
      setErrors(prev => ({ ...prev, [card]: problem }));
      delete pendingRef.current[key];
      return;
    }
    setErrors(prev => ({ ...prev, [card]: null }));
    pendingRef.current[key] = value;
    clearTimeout(timerRef.current);
    if (immediate) flush();
    else timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  const commitWeight = useCallback(() => {
    const t = weightText.trim();
    const n = t === '' ? null : Number(t);
    if (n !== null && !Number.isFinite(n)) {
      setErrors(prev => ({ ...prev, her: 'Weight should be a number' }));
      return;
    }
    if (n !== (config?.weight_lbs ?? null)) change('weight_lbs', n, { now: true });
  }, [weightText, config, change]);

  // ---- Alerts and sounds (unchanged behavior) ---------------------------
  const updateSound = useCallback((partial) => {
    setSoundSettingsState(setSoundSettings(partial));
  }, []);

  const handleToggleSoundEnabled = useCallback(() => {
    const turningOn = !soundSettings.enabled;
    updateSound({ enabled: turningOn });
    if (turningOn) previewSound(soundSettings.style);
    setSoundJustToggled(true);
    setTimeout(() => setSoundJustToggled(false), 700);
  }, [soundSettings.enabled, soundSettings.style, updateSound]);

  const handleSelectSoundStyle = useCallback((styleId) => {
    updateSound({ style: styleId });
    previewSound(styleId);
  }, [updateSound]);

  const handleVolumeChange = useCallback((e) => {
    updateSound({ volume: Number(e.target.value) });
  }, [updateSound]);

  const handleVolumeCommit = useCallback(() => {
    previewSound(soundSettings.style);
  }, [soundSettings.style]);

  const handleTogglePush = useCallback(async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushStatus === 'on') {
        await disablePushAlerts();
        setPushStatus('off');
        setPushMessage({ text: 'Phone alerts turned off', isError: false });
      } else {
        if (!vapidPublicKey) throw new Error("Alerts aren't set up yet — try again in a moment");
        await enablePushAlerts(vapidPublicKey);
        setPushStatus('on');
        setPushMessage({ text: 'Phone alerts turned on', isError: false });
      }
      setPushJustSucceeded(true);
      setTimeout(() => setPushJustSucceeded(false), 900);
    } catch (err) {
      console.error(err);
      setPushMessage({ text: err.message || 'Something went wrong — try again', isError: true });
      setPushFailed(true);
      setTimeout(() => setPushFailed(false), 1100);
    } finally {
      setPushBusy(false);
    }
  }, [pushStatus, vapidPublicKey]);

  const handleSignOut = useCallback(async () => {
    if (Object.keys(pendingRef.current).length) await flush();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }, [router, flush]);

  // ---- Derived bits ------------------------------------------------------
  const me = parentName(email);
  const partner = Object.values(PARENT_NAMES).find(n => n !== me) || 'the other parent';
  const timezone = config?.timezone || 'America/New_York';
  const age = config ? ageLine(config.birth_date, now, timezone) : null;
  const goal = config ? dailyMilkTarget(config.weight_lbs) : null;
  const phoneZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const zoneOptions = [...US_ZONES];
  if (config && !zoneOptions.some(z => z.value === config.timezone)) zoneOptions.push({ value: config.timezone, label: config.timezone.replace(/_/g, ' ') });
  const lateness = config?.overdue_multiplier ?? 1.25;
  const latenessOptions = LATENESS.some(o => o.value === Number(lateness))
    ? LATENESS
    : [...LATENESS, { value: Number(lateness), label: `+${Math.round((lateness - 1) * 100)}%` }];
  const medTimes = config?.medicine_times_local || [];

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Profile</h1>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      {loading || !config ? (
        <div className="card">
          <div className="info-item">{errors.her || 'Loading…'}</div>
        </div>
      ) : (
        <>
          {/* Her: name, age, and the three things about her you'll update. */}
          <div className="card profile-hero">
            <div className="card-head">
              <div>
                <div className="profile-name">{BABY_NAME}</div>
                {age && <div className="profile-age" suppressHydrationWarning>{age}</div>}
              </div>
              <SaveState state={saveState.her} />
            </div>

            <div className="form-row profile-field">
              <label className="form-label" htmlFor="birth_date">Birth date</label>
              <input
                id="birth_date"
                className="form-input"
                type="date"
                value={config.birth_date || ''}
                onChange={e => change('birth_date', e.target.value || null)}
              />
              <div className="form-hint">Used for her age and the age-based Insights.</div>
            </div>

            <div className="form-row profile-field">
              <label className="form-label" htmlFor="weight_lbs">Weight</label>
              <div className="form-input-suffix">
                <input
                  id="weight_lbs"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={weightText}
                  onChange={e => setWeightText(e.target.value)}
                  onBlur={commitWeight}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
                <span className="form-suffix">lbs</span>
              </div>
              {goal && (
                <div className="milk-preview">
                  <span className="milk-preview-pill">Daily milk target: {goal.target} oz</span>
                </div>
              )}
              <div className="form-hint">Weight × 2.5 oz, up to 32 oz a day. Update it after weigh-ins.</div>
            </div>

            <div className="form-row profile-field">
              <label className="form-label" htmlFor="target_bedtime_local">Usual bedtime</label>
              <input
                id="target_bedtime_local"
                className="form-input"
                type="time"
                value={config.target_bedtime_local || ''}
                onChange={e => change('target_bedtime_local', e.target.value)}
              />
            </div>
            {errors.her && <div className="form-message error">{errors.her}</div>}
          </div>

          {/* Alerts: this phone's switch, plus how late counts as late. */}
          <div className="card">
            <div className="card-head">
              <div className="section-title">Phone alerts</div>
              <SaveState state={saveState.alerts} />
            </div>
            {pushStatus === 'unsupported' && (
              <div className="form-hint">Phone alerts aren't supported in this browser.</div>
            )}
            {pushStatus === 'ios-needs-install' && (
              <div className="form-hint">On iPhone: add this app to your Home Screen (Share → Add to Home Screen), then open it from there to turn alerts on.</div>
            )}
            {pushStatus === 'checking' && <div className="form-hint">Checking{'…'}</div>}
            {(pushStatus === 'on' || pushStatus === 'off') && (
              <div className="toggle-row">
                <div className="form-hint toggle-hint">
                  Reminders when something's overdue, and a heads-up whenever {partner} logs something. Just for this phone.
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushStatus === 'on'}
                  aria-label="Phone alerts"
                  aria-busy={pushBusy}
                  className={`switch ${pushFailed ? 'is-error' : ''} ${pushJustSucceeded ? 'is-success' : ''}`}
                  onClick={handleTogglePush}
                  disabled={pushBusy}
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            )}
            {pushMessage && (
              <div className={`form-message ${pushMessage.isError ? 'error' : 'success'}`}>{pushMessage.text}</div>
            )}

            <div className="form-label profile-sub">Count it as overdue when she's</div>
            <div className="choice-row" role="radiogroup" aria-label="Count it as overdue when she's">
              {latenessOptions.map(o => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={Number(lateness) === o.value}
                  className={`choice${Number(lateness) === o.value ? ' is-on' : ''}`}
                  onClick={() => change('overdue_multiplier', o.value, { now: true })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="form-hint">
              With a 3h feed gap, that's after {formatHours(3 * lateness)} · +{Math.round((lateness - 1) * 100)}% of her usual gap.
            </div>
          </div>

          {/* Medicine: a list of times instead of typed 24h text. */}
          <div className="card">
            <div className="card-head">
              <div className="section-title">Medicine</div>
              <SaveState state={saveState.medicine} />
            </div>
            {medTimes.length === 0 && <div className="form-hint">No schedule. Add a time to get reminders.</div>}
            <ul className="med-times">
              {medTimes.map((t, i) => (
                <li key={i} className="med-time">
                  <input
                    className="form-input"
                    type="time"
                    aria-label={`Medicine time ${i + 1}`}
                    value={t}
                    onChange={e => change('medicine_times_local', medTimes.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button
                    type="button"
                    className="med-remove"
                    aria-label={`Remove medicine time ${i + 1}`}
                    onClick={() => change('medicine_times_local', medTimes.filter((_, j) => j !== i), { now: true })}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="add-row-btn"
              onClick={() => change('medicine_times_local', [...medTimes, medTimes.length ? '20:00' : '08:00'], { now: true })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add time
            </button>
            {medTimes.length > 0 && (
              <Stepper
                label="Late after"
                hint="How long past a dose time before it counts as missed"
                value={Number(config.medicine_grace_minutes ?? 15)}
                step={5}
                min={0}
                max={120}
                format={v => `${v} min`}
                onChange={v => change('medicine_grace_minutes', v)}
              />
            )}
            {errors.medicine && <div className="form-message error">{errors.medicine}</div>}
          </div>

          {/* App look: skin and light/dark, saved on this phone only. */}
          <div className="card">
            <div className="section-title">App look</div>
            <div className="skin-grid" role="radiogroup" aria-label="Skin">
              {SKINS.map(k => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={skin === k.id}
                  className={`skin-option${skin === k.id ? ' is-on' : ''}`}
                  onClick={() => { applySkin(k.id); setSkin(k.id); }}
                >
                  <span className="skin-swatch" aria-hidden="true">
                    {k.swatch.map(c => <span key={c} style={{ background: c }} />)}
                  </span>
                  <span className="skin-text">
                    <span className="skin-name">{k.name}</span>
                    <span className="skin-note">{k.note}</span>
                  </span>
                  {skin === k.id && (
                    <svg className="skin-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  )}
                </button>
              ))}
            </div>
            <div className="form-label profile-sub">Light or dark</div>
            <div className="choice-row" role="radiogroup" aria-label="Light or dark">
              {[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  className={`choice${mode === id ? ' is-on' : ''}`}
                  onClick={() => { applyMode(id); setMode(id); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="form-hint">Just for this phone. Feed, diaper and sleep colors stay the same in every skin.</div>
          </div>

          {/* Sounds: saved on this phone only. */}
          <div className="card">
            <div className="section-title">Button sounds</div>
            <div className="toggle-row">
              <div className="form-hint toggle-hint">A short sound when you tap a button.</div>
              <button
                type="button"
                role="switch"
                aria-checked={!!soundSettings.enabled}
                aria-label="Button sounds"
                className={`switch ${soundJustToggled ? 'is-success' : ''}`}
                onClick={handleToggleSoundEnabled}
                data-skip-click-sound="true"
              >
                <span className="switch-thumb" />
              </button>
            </div>

            <div className="form-label" style={{ marginTop: '18px' }}>Sound</div>
            <div className="picker-grid sound-grid">
              {SOUND_STYLES.map(st => (
                <button
                  key={st.id}
                  className={`picker-btn ${soundSettings.style === st.id ? 'selected' : ''}`}
                  aria-pressed={soundSettings.style === st.id}
                  data-skip-click-sound="true"
                  onClick={() => handleSelectSoundStyle(st.id)}
                >
                  {soundSettings.style === st.id && (
                    <svg className="picker-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  )}
                  {st.label}
                </button>
              ))}
            </div>
            <div className="form-hint">Tap one to hear it.</div>

            <div className="form-label" style={{ marginTop: '16px' }}>Volume</div>
            <input
              type="range"
              className="volume-slider"
              aria-label="Button sound volume"
              min="0"
              max="1"
              step="0.05"
              value={soundSettings.volume}
              onChange={handleVolumeChange}
              onMouseUp={handleVolumeCommit}
              onTouchEnd={handleVolumeCommit}
            />
          </div>

          {/* Advanced: rarely changed, folded away. */}
          <details className="card advanced advanced-card">
            <summary className="advanced-summary">
              <span className="section-title">Advanced</span>
              <span className="advanced-hint">Timezone and starting gaps</span>
              <svg className="advanced-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <div className="card-head advanced-head">
              <span />
              <SaveState state={saveState.advanced} />
            </div>

            <div className="form-row profile-field">
              <label className="form-label" htmlFor="timezone">Timezone</label>
              <select
                id="timezone"
                className="form-input form-select"
                value={config.timezone}
                onChange={e => change('timezone', e.target.value, { now: true })}
              >
                {zoneOptions.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
              {phoneZone && phoneZone !== config.timezone && (
                <button type="button" className="add-row-btn" onClick={() => change('timezone', phoneZone, { now: true })}>
                  Use this phone's timezone ({phoneZone.split('/').pop().replace(/_/g, ' ')})
                </button>
              )}
            </div>

            <div className="form-hint advanced-intro">Until there's enough history, the app assumes these gaps. After that it learns her real ones.</div>
            <Stepper
              label="Feeds"
              value={Number(config.feed_fallback_hours)}
              step={0.5}
              min={0.5}
              max={8}
              format={formatHours}
              onChange={v => change('feed_fallback_hours', v)}
            />
            <Stepper
              label="Diapers"
              value={Number(config.diaper_fallback_hours)}
              step={0.5}
              min={0.5}
              max={8}
              format={formatHours}
              onChange={v => change('diaper_fallback_hours', v)}
            />
            <Stepper
              label="Awake between naps"
              value={Number(config.wake_window_fallback_hours)}
              step={0.25}
              min={0.5}
              max={6}
              format={formatHours}
              onChange={v => change('wake_window_fallback_hours', v)}
            />
            {errors.advanced && <div className="form-message error">{errors.advanced}</div>}
          </details>
        </>
      )}

      <div className="card signout-card">
        <div className="signout-who">
          Signed in as <strong>{me || email || '…'}</strong>
        </div>
        <button type="button" className="quiet-btn signout-btn" onClick={handleSignOut}>Sign out</button>
      </div>

      <TabBar active="settings" />
    </div>
  );
}
