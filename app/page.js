'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import {
  computeStatus,
  isoToLocalDatetimeInputValue,
  localDateStr,
  localDateTimeToUtc,
} from '../lib/logic';
import { dailySummaries } from '../lib/summaries';

const EVENT_TYPES = ['feed', 'diaper', 'nap_start', 'nap_end', 'medicine', 'sleep_start', 'sleep_end'];

const TYPE_LABELS = {
  feed: 'Fed',
  nap_start: 'Nap started',
  nap_end: 'Nap ended',
  diaper: 'Diaper',
  medicine: 'Medicine',
  sleep_start: 'Bedtime',
  sleep_end: 'Wake up',
};

// Bounds how much history is fetched/rescanned on every load and 60s tick.
// 30 days comfortably covers rolling-average sample windows and the two-week
// Patterns window, without growing unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;
// Recent activity only needs to show the last few days, not the full
// 30-day fetch window, to keep the day-grouped list from growing unbounded.
const RECENT_ACTIVITY_LIMIT = 60;

function formatLocalTime(iso, timezone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

function formatHours(h) {
  if (h == null) return null;
  if (h < 1) return `${Math.max(0, Math.round(h * 60))}m`;
  return `${h.toFixed(1)}h`;
}

// "1h 30m" / "45 minutes" style duration, for prose (eyebrows, sub-lines).
function formatDurationWords(hours) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTimeOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatRelative(iso, now) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatGroupDate(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

// Soonest medicine_times_local slot that's still ahead of `now` (today's
// remaining slots, or tomorrow's first, if all of today's have passed).
function nextMedicineSlot(config, now) {
  const { medicine_times_local, timezone } = config;
  if (!medicine_times_local?.length) return null;
  const candidates = [];
  for (const dayOffset of [0, 1]) {
    const dayStr = localDateStr(new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000), timezone);
    for (const t of medicine_times_local) {
      const slot = localDateTimeToUtc(dayStr, t, timezone);
      if (slot.getTime() > now.getTime()) candidates.push(slot);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] || null;
}

// Picks whichever of feed/diaper/nap/night-sleep is nearest its due time (or
// furthest past it) as the Next-up card's subject. A single "hours past due"
// score does double duty: for a not-yet-due category it's the most negative
// (closest to zero = nearest due), for an overdue one it's the most positive
// (furthest past). Categories with no dueAt (nothing logged yet, or
// currently asleep) aren't candidates — there's nothing to be "next up".
function pickNextUp(status, now) {
  let best = null;
  let bestScore = -Infinity;
  for (const key of ['feed', 'diaper', 'nap', 'sleep']) {
    const s = status[key];
    if (!s?.dueAt) continue;
    const score = (now.getTime() - new Date(s.dueAt).getTime()) / (1000 * 60 * 60);
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function nextUpContent(key, status, config, timezone) {
  const s = status[key];
  const dueClock = s.dueAt ? formatLocalTime(s.dueAt, timezone) : '';
  const lastClock = s.lastEventTime ? formatLocalTime(s.lastEventTime, timezone) : '';
  const overdueMultiplier = config.overdue_multiplier ?? 1.25;

  if (key === 'feed' || key === 'diaper') {
    const noun = key === 'feed' ? 'Feed' : 'Diaper change';
    const pastNoun = key === 'feed' ? 'fed' : 'changed';
    if (s.state === 'overdue') {
      return {
        eyebrow: `Late by ${formatDurationWords(s.hoursSince - s.avgHours)}`,
        headline: `${noun} was due ${dueClock}`,
        sub: `That's ${formatHours(s.hoursSince)} since last ${pastNoun} — past ${overdueMultiplier}× her usual ${formatHours(s.avgHours)} gap.`,
      };
    }
    if (s.state === 'due-soon') {
      return {
        eyebrow: `Due in about ${formatDurationWords(Math.max(0, s.avgHours - s.hoursSince))}`,
        headline: `${noun} around ${dueClock}`,
        sub: `Last ${pastNoun} ${lastClock} · she usually goes ${formatHours(s.avgHours)}`,
      };
    }
    return {
      eyebrow: 'Next up',
      headline: `${noun} around ${dueClock}`,
      sub: `Last ${pastNoun} ${lastClock} · she usually goes ${formatHours(s.avgHours)}`,
    };
  }

  if (key === 'nap') {
    if (s.state === 'overdue') {
      return {
        eyebrow: `Late by ${formatDurationWords(s.hoursSince - s.avgHours)}`,
        headline: `Nap was due ${dueClock}`,
        sub: `Awake ${formatHours(s.hoursSince)} — past ${overdueMultiplier}× her usual ${formatHours(s.avgHours)} wake window.`,
      };
    }
    if (s.state === 'due-soon') {
      return {
        eyebrow: `Due in about ${formatDurationWords(Math.max(0, s.avgHours - s.hoursSince))}`,
        headline: `Nap around ${dueClock}`,
        sub: `Awake since ${lastClock} · usual wake window ${formatHours(s.avgHours)}`,
      };
    }
    return {
      eyebrow: 'Next up',
      headline: `Nap around ${dueClock}`,
      sub: `Awake since ${lastClock} · usual wake window ${formatHours(s.avgHours)}`,
    };
  }

  // Night sleep is judged against a wall-clock target, not an average gap,
  // so its due-soon/overdue states are both "already past bedtime" — only
  // the grace deadline separates them. There's no "approaching" due-soon
  // phase the way there is for the interval-based categories above.
  const graceMinutes = config.medicine_grace_minutes;
  const minutesPast = Math.round((s.hoursSince ?? 0) * 60);
  if (s.state === 'overdue') {
    return {
      eyebrow: `Late by ${formatDurationWords(s.hoursSince)}`,
      headline: `Bedtime was due ${dueClock}`,
      sub: `That's ${minutesPast}m past bedtime — beyond the ${graceMinutes}m grace window.`,
    };
  }
  if (s.state === 'due-soon') {
    return {
      eyebrow: 'Just past bedtime',
      headline: `Bedtime was due ${dueClock}`,
      sub: `${minutesPast}m past · grace ends in ${Math.max(0, graceMinutes - minutesPast)}m.`,
    };
  }
  return {
    eyebrow: 'Next up',
    headline: `Bedtime around ${dueClock}`,
    sub: `Usually around ${formatTimeOfDay(config.target_bedtime_local ?? '19:15')}`,
  };
}

// Collapses adjacent nap_start/nap_end pairs (in the newest-first event
// list) into a single row, and groups the rest by local day.
function buildActivityGroups(events, timezone, now) {
  const sorted = [...events].sort((a, b) => new Date(b.event_time) - new Date(a.event_time));
  const todayStr = localDateStr(now, timezone);
  const yesterdayStr = localDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone);

  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const next = sorted[i + 1];
    if (e.type === 'nap_end' && next?.type === 'nap_start') {
      items.push({ id: e.id, kind: 'nap', start: next.event_time, end: e.event_time, raw: e });
      i++;
      continue;
    }
    items.push({ id: e.id, kind: 'single', type: e.type, event_time: e.event_time, raw: e });
  }

  const groups = [];
  let currentDay = null;
  let currentGroup = null;
  for (const item of items) {
    const ts = item.kind === 'nap' ? item.end : item.event_time;
    const dayStr = localDateStr(new Date(ts), timezone);
    if (dayStr !== currentDay) {
      currentDay = dayStr;
      currentGroup = {
        dayStr,
        label: dayStr === todayStr ? 'Today' : dayStr === yesterdayStr ? 'Yesterday' : formatGroupDate(dayStr),
        items: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }
  return groups;
}

export default function Page() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [toastShow, setToastShow] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [moreOpen, setMoreOpen] = useState(false);
  const toastTimeoutRef = useRef(null);

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [configRes, eventsRes] = await Promise.all([
      supabase.from('baby_config').select('*').eq('id', 1).single(),
      supabase.from('baby_events').select('*').gte('event_time', since).order('event_time', { ascending: false }),
    ]);
    if (configRes.error) console.error(configRes.error);
    if (eventsRes.error) console.error(eventsRes.error);
    if (configRes.data) setConfig(configRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // keep "time since" displays fresh without needing a full refetch
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  const showToast = useCallback((message, opts = {}) => {
    clearTimeout(toastTimeoutRef.current);
    setToast({ message, actionLabel: opts.actionLabel, onAction: opts.onAction });
    setToastShow(true);
    toastTimeoutRef.current = setTimeout(() => setToastShow(false), opts.actionLabel ? 4000 : 2200);
  }, []);

  // Inserts optimistically so a tap feels instant and the rolling averages
  // driving the whole screen don't wait on a round trip. Wrapping the
  // supabase call in Promise.resolve() up front is what makes it safe to
  // await from both the toast's Undo handler and the code below — a
  // supabase-js query builder is a thenable that re-runs the request on
  // every `await`/`.then()`, so without this a fast Undo tap would fire a
  // second insert instead of reusing the first one's result.
  const logEvent = useCallback((type, label) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const eventTime = new Date().toISOString();
    setEvents(prev => [{ id: tempId, type, event_time: eventTime }, ...prev]);

    const insertPromise = Promise.resolve(
      supabase.from('baby_events').insert({ type, event_time: eventTime }).select().single()
    );

    showToast(`Logged: ${label}`, {
      actionLabel: 'Undo',
      onAction: async () => {
        const { data, error } = await insertPromise;
        if (!error && data) {
          await supabase.from('baby_events').delete().eq('id', data.id);
          setEvents(prev => prev.filter(e => e.id !== data.id));
        } else {
          setEvents(prev => prev.filter(e => e.id !== tempId));
        }
      },
    });

    insertPromise.then(({ data, error }) => {
      if (error) {
        console.error(error);
        setEvents(prev => prev.filter(e => e.id !== tempId));
        showToast('Failed to log — try again');
        return;
      }
      setEvents(prev => prev.map(e => (e.id === tempId ? data : e)));
    });
  }, [showToast]);

  const openEdit = useCallback((event) => {
    if (typeof event.id !== 'number') return; // not yet reconciled with the server
    setEditingEvent(event);
    setEditType(event.type);
    setEditValue(isoToLocalDatetimeInputValue(event.event_time, config?.timezone || 'America/New_York'));
  }, [config]);

  const cancelEdit = useCallback(() => {
    setEditingEvent(null);
    setEditValue('');
    setEditType('');
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingEvent || !editValue) return;
    const [datePart, timePart] = editValue.split('T');
    const iso = localDateTimeToUtc(datePart, timePart, config?.timezone || 'America/New_York').toISOString();
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_time: iso, type: editType }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { event: updated } = await res.json();
      setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      showToast('Entry updated');
      cancelEdit();
    } catch (err) {
      console.error(err);
      showToast('Failed to update — try again');
    }
  }, [editingEvent, editValue, editType, config, cancelEdit, showToast]);

  const deleteEdit = useCallback(async () => {
    if (!editingEvent) return;
    try {
      const { error } = await supabase.from('baby_events').delete().eq('id', editingEvent.id);
      if (error) throw error;
      setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
      showToast('Entry deleted');
      cancelEdit();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete — try again');
    }
  }, [editingEvent, cancelEdit, showToast]);

  const status = useMemo(() => {
    if (!config) return null;
    return computeStatus(events, config, now);
  }, [events, config, now]);

  const today = useMemo(() => {
    if (!config) return null;
    return dailySummaries(events, config, 1)[0];
  }, [events, config, now]);

  const timezone = config?.timezone || 'America/New_York';
  const activityGroups = useMemo(
    () => buildActivityGroups(events.slice(0, RECENT_ACTIVITY_LIMIT), timezone, now),
    [events, timezone, now]
  );
  const nextUpKey = status ? pickNextUp(status, now) : null;
  const nextUp = nextUpKey ? nextUpContent(nextUpKey, status, config, timezone) : null;
  const nextUpTone = nextUpKey ? status[nextUpKey].state : null;
  const medicineNext = config ? nextMedicineSlot(config, now) : null;

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Today</h1>
        <div className="header-right">
          <div className="header-datetime" suppressHydrationWarning>
            {new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(now)}
            {' · '}
            {formatLocalTime(now.toISOString(), timezone)}
          </div>
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
      </div>

      {loading || !status ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          {nextUp ? (
            <div className={`nextup nextup-${nextUpTone}`}>
              <div className="nextup-eyebrow">{nextUp.eyebrow}</div>
              <div className="nextup-headline">{nextUp.headline}</div>
              <div className="nextup-sub">{nextUp.sub}</div>
            </div>
          ) : (
            <div className="nextup nextup-on-track">
              <div className="nextup-eyebrow">Getting started</div>
              <div className="nextup-headline">Tap Fed or Diaper to begin</div>
              <div className="nextup-sub">Her patterns will show up here once a bit of history builds up.</div>
            </div>
          )}

          <div className="btn-grid">
            <button className="log-btn log-btn-primary btn-feed" onClick={() => logEvent('feed', 'Fed')}>Fed</button>
            <button className="log-btn log-btn-primary btn-diaper" onClick={() => logEvent('diaper', 'Diaper')}>Diaper</button>
          </div>

          <div className="stateful-grid">
            {status.nap.asleep ? (
              <button className="stateful-btn filled nap-filled" onClick={() => logEvent('nap_end', 'Nap ended')}>
                <span className="stateful-label">End nap</span>
                <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.nap.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
              </button>
            ) : (
              <button className="stateful-btn outline nap-outline" onClick={() => logEvent('nap_start', 'Nap started')}>
                <span className="stateful-label">Start nap</span>
                <span className="stateful-sub">{status.nap.hoursSince != null ? `awake ${formatHours(status.nap.hoursSince)}` : 'no naps yet'}</span>
              </button>
            )}

            {status.sleep.asleep ? (
              <button className="stateful-btn filled sleep-filled" onClick={() => logEvent('sleep_end', 'Wake up')}>
                <span className="stateful-label">Wake Up</span>
                <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.sleep.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
              </button>
            ) : (
              <button className="stateful-btn outline sleep-outline" onClick={() => logEvent('sleep_start', 'Bedtime')}>
                <span className="stateful-label">Bedtime</span>
                <span className="stateful-sub">usual {formatTimeOfDay(config.target_bedtime_local ?? '19:15')}</span>
              </button>
            )}
          </div>

          <button className="medicine-row" onClick={() => logEvent('medicine', 'Medicine')}>
            <span>Medicine</span>
            <span className="medicine-detail">
              {medicineNext ? `next window ${formatLocalTime(medicineNext.toISOString(), timezone)}` : 'no schedule set'}
            </span>
          </button>

          {today && (
            <div className="stats-row">
              <div className="stat-tile">
                <div className="stat-value">{today.feeds}</div>
                <div className="stat-label">Feeds</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{formatHours(today.napMinutes / 60) || '0m'}</div>
                <div className="stat-label">Napped ({today.naps})</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{today.diapers}</div>
                <div className="stat-label">Diapers</div>
              </div>
            </div>
          )}

          <div className="card">
            <button className="section-title section-toggle" onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
              <span>Everything else</span>
              <span className={`chevron ${moreOpen ? 'open' : ''}`}>{'>'}</span>
            </button>
            {moreOpen && (
              <>
                <MoreRow label="Feed" status={status.feed} timezone={timezone} />
                <MoreRow label="Diaper" status={status.diaper} timezone={timezone} />
                <MoreRow label="Nap" status={status.nap} timezone={timezone} asleepLabel="Napping" />
                <MoreRow label="Night sleep" status={status.sleep} timezone={timezone} asleepLabel="Asleep" />
                <div className="status-row">
                  <div>
                    <div className="status-label">Medicine</div>
                    {status.medicine.overdue && <div className="status-detail">Overdue</div>}
                  </div>
                  <span className={`more-detail ${status.medicine.overdue ? 'overdue' : 'muted'}`}>
                    {medicineNext ? formatLocalTime(medicineNext.toISOString(), timezone) : 'No schedule set'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="section-title">Recent activity</div>
            <div className="history">
              {activityGroups.length === 0 ? (
                <div className="info-item">Nothing logged yet.</div>
              ) : (
                activityGroups.map(group => (
                  <div key={group.dayStr} className="activity-group">
                    <div className="activity-day-label">{group.label}</div>
                    {group.items.map(item => (
                      <button key={item.id} className="activity-item" onClick={() => openEdit(item.raw)}>
                        {item.kind === 'nap' ? (
                          <>
                            <span className="activity-type">
                              Nap · {formatDurationWords((new Date(item.end) - new Date(item.start)) / (1000 * 60 * 60))}
                            </span>
                            <span className="activity-time">
                              {formatLocalTime(item.start, timezone)} – {formatLocalTime(item.end, timezone)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="activity-type">{TYPE_LABELS[item.type] || item.type}</span>
                            <span className="activity-time">
                              {formatLocalTime(item.event_time, timezone)}
                              {group.label === 'Today' ? ` · ${formatRelative(item.event_time, now)}` : ''}
                            </span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <span>{toast?.message}</span>
        {toast?.actionLabel && (
          <button
            className="toast-action"
            onClick={async () => {
              setToastShow(false);
              await toast.onAction?.();
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>

      {editingEvent && (
        <div className="modal-overlay" onClick={cancelEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit entry</div>
            <select className="modal-select" value={editType} onChange={e => setEditType(e.target.value)}>
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={cancelEdit}>Cancel</button>
              <button className="modal-btn-confirm" onClick={confirmEdit}>Save</button>
            </div>
            <button className="modal-btn-delete" onClick={deleteEdit}>Delete entry</button>
          </div>
        </div>
      )}

      <nav className="tab-bar">
        <span className="tab-item tab-active">Log</span>
        <Link href="/patterns" className="tab-item">Patterns</Link>
      </nav>
    </div>
  );
}

function MoreRow({ label, status, timezone, asleepLabel }) {
  const detail = status.asleep
    ? `${asleepLabel} since ${formatLocalTime(status.lastEventTime, timezone)}`
    : status.dueAt
      ? formatLocalTime(status.dueAt, timezone)
      : 'On track';
  const toneClass = status.asleep ? 'muted' : status.state === 'overdue' ? 'overdue' : status.state === 'due-soon' ? 'due-soon' : 'muted';
  return (
    <div className="status-row">
      <div>
        <div className="status-label">{label}</div>
      </div>
      <span className={`more-detail ${toneClass}`}>{detail}</span>
    </div>
  );
}
