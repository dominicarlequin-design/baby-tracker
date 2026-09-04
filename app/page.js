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
import { dailySummaries, bedtimePattern, formatMinutesAsClock } from '../lib/summaries';

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

const DIAPER_DETAIL_LABELS = { pee: 'Pee', poop: 'Poop', both: 'Both' };
const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Line-icon paths for the Log buttons, each rendered on a small tinted
// disc (colored via CSS on the parent button class, see .icon-disc in
// globals.css) rather than a flat glyph — chosen over emoji so they can be
// tinted to match each button's own palette and render identically
// everywhere instead of varying by OS.
const ICON_PATHS = {
  feed: (
    <>
      <path d="M10 2h4M10.5 2v3.2c0 .5-.2 1-.6 1.4l-1 1c-.6.6-.9 1.4-.9 2.2V19a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V9.8c0-.8-.3-1.6-.9-2.2l-1-1c-.4-.4-.6-.9-.6-1.4V2" />
      <path d="M9 13h6" />
    </>
  ),
  diaper: (
    <>
      <path d="M4 5h16v4.5c0 5-3.5 8.5-8 9.5-4.5-1-8-4.5-8-9.5V5Z" />
      <path d="M4 9.5c2 1 5 1 8 1s6 0 8-1" />
    </>
  ),
  nap: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />,
  bedtime: (
    <>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      <path d="M17 3.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />
    </>
  ),
  wake: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </>
  ),
  medicine: (
    <>
      <path d="M9 3h6M12 3v4" />
      <path d="M6 8h12l-1 3.2c-.2.6-.2 1.2 0 1.8l1.6 4.6a2 2 0 0 1-1.9 2.4H7.3a2 2 0 0 1-1.9-2.4L7 13c.2-.6.2-1.2 0-1.8L6 8Z" />
      <path d="M8.5 13.5h7" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <span className="icon-disc" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name]}
      </svg>
    </span>
  );
}

// Extra "· 4 oz" / "· Poop" suffix for a Recent Activity row, when the
// underlying event has feed_ounces / diaper_detail recorded.
function activityDetailSuffix(raw) {
  if (raw.type === 'feed' && raw.feed_ounces != null) return ` · ${raw.feed_ounces} oz`;
  if (raw.type === 'diaper' && raw.diaper_detail) return ` · ${DIAPER_DETAIL_LABELS[raw.diaper_detail] || raw.diaper_detail}`;
  return '';
}

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

  // Nap never reaches the 'overdue' state (see napStatus in lib/logic.js —
  // wake windows swing too much for "late" to mean something was missed),
  // so 'due-soon' alone has to cover both "getting close" and "well past
  // her usual window but that's normal" — split by hoursSince vs. avgHours
  // rather than by state, and kept deliberately non-alarming either way.
  if (key === 'nap') {
    if (s.state === 'due-soon' && s.hoursSince >= s.avgHours) {
      return {
        eyebrow: 'Running long',
        headline: `Still awake past ${dueClock}`,
        sub: `Awake ${formatHours(s.hoursSince)} — longer than her usual ${formatHours(s.avgHours)} wake window. That varies night to night, so it's not necessarily overdue.`,
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
    // Eyebrow is just the category name here, not the lateness figure —
    // that number lives in `lateBy` instead, rendered once inline with the
    // headline, so it isn't stated twice the way "Late by 17 minutes" /
    // "That's 17m past bedtime" used to.
    return {
      eyebrow: 'Bedtime',
      headline: `Was due ${dueClock}`,
      lateBy: `${formatDurationWords(s.hoursSince)} late`,
      sub: `Past the ${graceMinutes}-minute grace window from Settings.`,
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

// Plain-language explanation of how a category's due-time estimate was
// reached, for the "Why?" button on each Upcoming row. Mirrors the actual
// logic in lib/logic.js's computeStatus rather than restating it loosely,
// so this never drifts from what the app is actually doing.
function explainStatus(key, status, config, timezone) {
  const overdueMultiplier = config.overdue_multiplier ?? 1.25;

  if (key === 'feed' || key === 'diaper') {
    const noun = key === 'feed' ? 'feeds' : 'diaper changes';
    const verb = key === 'feed' ? 'fed' : 'changed';
    if (!status.lastEventTime) {
      return `No ${noun} logged yet, so this starts from an assumed gap of ${formatHours(status.avgHours)} until real history builds up.`;
    }
    const dueSoonAfter = formatHours(status.avgHours * 0.8);
    const overdueAfter = formatHours(status.avgHours * overdueMultiplier);
    return `Based on the average time between your last several ${noun} (currently ${formatHours(status.avgHours)}). Last ${verb} at ${formatLocalTime(status.lastEventTime, timezone)}, so the next one is expected around ${formatLocalTime(status.dueAt, timezone)}. It's flagged "due soon" once ${dueSoonAfter} has passed, and "overdue" past ${overdueAfter} — that's the average gap times the ${overdueMultiplier} overdue multiplier from Settings.`;
  }

  if (key === 'nap') {
    if (status.asleep) {
      return `She's currently napping, tracked since ${formatLocalTime(status.lastEventTime, timezone)}. The next nap estimate starts fresh once she wakes.`;
    }
    if (!status.lastEventTime) {
      return `No naps logged yet, so this starts from an assumed wake window of ${formatHours(status.avgHours)} until real history builds up.`;
    }
    const dueSoonAfter = formatHours(status.avgHours * 0.8);
    return `Based on how long she typically stays awake between naps (currently ${formatHours(status.avgHours)}). Awake since ${formatLocalTime(status.lastEventTime, timezone)}, so the next nap is expected around ${formatLocalTime(status.dueAt, timezone)}. "Due soon" kicks in after ${dueSoonAfter} awake. Unlike Feed and Diaper, Nap never turns "overdue" — wake windows swing too much day to day for a late nap to mean something was missed, so it just keeps reading as due until she naps again.`;
  }

  if (key === 'sleep') {
    if (status.asleep) {
      return `She's asleep for the night, tracked since ${formatLocalTime(status.lastEventTime, timezone)}.`;
    }
    const bedtime = formatTimeOfDay(config.target_bedtime_local ?? '19:15');
    return `Night sleep isn't averaged from history like the others — it's judged against your Target bedtime (${bedtime}, set in Settings). Once that time passes with no Bedtime tap, it's flagged "due soon," then "overdue" ${config.medicine_grace_minutes} minutes after that.`;
  }

  if (key === 'medicine') {
    const times = (config.medicine_times_local || []).map(formatTimeOfDay).join(', ');
    const lastSlot = status.lastScheduledSlot ? formatLocalTime(status.lastScheduledSlot, timezone) : null;
    return `Medicine runs on a fixed daily schedule (${times}, set in Settings) rather than an average.${lastSlot ? ` The most recent scheduled dose was ${lastSlot}.` : ''} It's flagged overdue if nothing is logged within ${config.medicine_grace_minutes} minutes of that time.`;
  }

  return '';
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
  const [activityOpen, setActivityOpen] = useState(false);
  const [feedPickerOpen, setFeedPickerOpen] = useState(false);
  const [diaperPickerOpen, setDiaperPickerOpen] = useState(false);
  const [editFeedOunces, setEditFeedOunces] = useState('');
  const [editDiaperDetail, setEditDiaperDetail] = useState('');
  const [explainKey, setExplainKey] = useState(null);
  const [bedtimePatternOpen, setBedtimePatternOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
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

  // keep the header clock and every "time since" display fresh without
  // needing a full refetch. 10s (not 60s) so the header clock never sits
  // a stale minute behind, and overdue/asleep-duration text updates
  // promptly instead of visibly lagging.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10 * 1000);
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
  const logEvent = useCallback((type, label, extra = {}) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const eventTime = new Date().toISOString();
    setEvents(prev => [{ id: tempId, type, event_time: eventTime, ...extra }, ...prev]);

    const insertPromise = Promise.resolve(
      supabase.from('baby_events').insert({ type, event_time: eventTime, ...extra }).select().single()
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
    setEditFeedOunces(event.feed_ounces != null ? String(event.feed_ounces) : '');
    setEditDiaperDetail(event.diaper_detail || '');
  }, [config]);

  const cancelEdit = useCallback(() => {
    setEditingEvent(null);
    setEditValue('');
    setEditType('');
    setEditFeedOunces('');
    setEditDiaperDetail('');
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingEvent || !editValue) return;
    const [datePart, timePart] = editValue.split('T');
    const iso = localDateTimeToUtc(datePart, timePart, config?.timezone || 'America/New_York').toISOString();
    try {
      // baby_events already has a public RLS update policy (same as its
      // insert/delete policies below), so this can go straight through the
      // anon client like the rest of this file — no need to round-trip
      // through /api/events/[id]'s service-role client, which 500s in
      // production because SUPABASE_SERVICE_ROLE_KEY was never configured.
      const { data: updated, error } = await supabase
        .from('baby_events')
        .update({
          event_time: iso,
          type: editType,
          feed_ounces: editType === 'feed' && editFeedOunces ? Number(editFeedOunces) : null,
          diaper_detail: editType === 'diaper' && editDiaperDetail ? editDiaperDetail : null,
        })
        .eq('id', editingEvent.id)
        .select()
        .single();
      if (error) throw error;
      setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      showToast('Entry updated');
      cancelEdit();
    } catch (err) {
      console.error(err);
      showToast('Failed to update — try again');
    }
  }, [editingEvent, editValue, editType, editFeedOunces, editDiaperDetail, config, cancelEdit, showToast]);

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

  // Historical bedtime pattern (last 14 nights), shown in a dropdown under
  // the Night sleep row alongside — not instead of — the Target-bedtime
  // due/overdue judgment that already drives status.sleep.
  const bedtimeInfo = useMemo(() => {
    if (!config) return null;
    return bedtimePattern(events, config, now, 14);
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

  // Every currently-overdue category at once, for the banner at the very
  // top of the page — the Next-up card below only ever surfaces the single
  // worst offender, so with two things overdue at the same time (e.g. Feed
  // and Diaper) the second one would otherwise go unnoticed without
  // expanding Upcoming and checking each row by hand.
  const overdueItems = useMemo(() => {
    if (!status) return [];
    const items = [];
    if (status.feed.overdue) {
      items.push({ key: 'feed', label: 'Feed', detail: `Late by ${formatDurationWords(status.feed.hoursSince - status.feed.avgHours)}` });
    }
    if (status.diaper.overdue) {
      items.push({ key: 'diaper', label: 'Diaper', detail: `Late by ${formatDurationWords(status.diaper.hoursSince - status.diaper.avgHours)}` });
    }
    if (status.nap.overdue) {
      items.push({ key: 'nap', label: 'Nap', detail: `Late by ${formatDurationWords(status.nap.hoursSince - status.nap.avgHours)}` });
    }
    if (status.sleep.overdue) {
      items.push({ key: 'sleep', label: 'Night sleep', detail: `Late by ${formatDurationWords(status.sleep.hoursSince)}` });
    }
    if (status.medicine.overdue) {
      const lateHours = status.medicine.graceDeadline
        ? Math.max(0, (now.getTime() - new Date(status.medicine.graceDeadline).getTime()) / (1000 * 60 * 60))
        : 0;
      items.push({ key: 'medicine', label: 'Medicine', detail: `Late by ${formatDurationWords(lateHours)}` });
    }
    return items;
  }, [status, now]);

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
          {overdueItems.length > 0 && (
            <div className="overdue-banner">
              <button
                className="overdue-banner-toggle"
                onClick={() => setOverdueOpen(o => !o)}
                aria-expanded={overdueOpen}
              >
                <span className="overdue-banner-title">
                  <span className="alert-badge" aria-hidden="true">!</span>
                  {overdueItems.length} overdue
                </span>
                <span className={`chevron ${overdueOpen ? 'open' : ''}`}>{'>'}</span>
              </button>
              {overdueOpen && (
                <div className="overdue-banner-list">
                  {overdueItems.map(item => (
                    <button
                      key={item.key}
                      className="overdue-banner-item"
                      onClick={() => setExplainKey(item.key)}
                    >
                      <span>{item.label}</span>
                      <span className="overdue-banner-detail">{item.detail}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {nextUp ? (
            <div className={`nextup nextup-${nextUpTone}`}>
              <div className={`nextup-eyebrow ${nextUp.lateBy ? 'category' : ''}`}>{nextUp.eyebrow}</div>
              <div className="nextup-headline">
                {nextUp.headline}
                {nextUp.lateBy && <span className="nextup-lateby"> · {nextUp.lateBy}</span>}
              </div>
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
            <button className="log-btn log-btn-primary btn-feed" onClick={() => setFeedPickerOpen(true)}>
              <Icon name="feed" />
              Fed
            </button>
            <button className="log-btn log-btn-primary btn-diaper" onClick={() => setDiaperPickerOpen(true)}>
              <Icon name="diaper" />
              Diaper
            </button>
          </div>

          <div className="stateful-grid">
            {status.nap.asleep ? (
              <button className="stateful-btn filled nap-filled" onClick={() => logEvent('nap_end', 'Nap ended')}>
                <Icon name="nap" />
                <span className="stateful-text">
                  <span className="stateful-label">End nap</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.nap.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className="stateful-btn outline nap-outline" onClick={() => logEvent('nap_start', 'Nap started')}>
                <Icon name="nap" />
                <span className="stateful-text">
                  <span className="stateful-label">Start nap</span>
                  <span className="stateful-sub">{status.nap.hoursSince != null ? `awake ${formatHours(status.nap.hoursSince)}` : 'no naps yet'}</span>
                </span>
              </button>
            )}

            {status.sleep.asleep ? (
              <button className="stateful-btn filled sleep-filled" onClick={() => logEvent('sleep_end', 'Wake up')}>
                <Icon name="wake" />
                <span className="stateful-text">
                  <span className="stateful-label">Wake Up</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.sleep.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className="stateful-btn outline sleep-outline" onClick={() => logEvent('sleep_start', 'Bedtime')}>
                <Icon name="bedtime" />
                <span className="stateful-text">
                  <span className="stateful-label">Bedtime</span>
                  <span className="stateful-sub">usual {formatTimeOfDay(config.target_bedtime_local ?? '19:15')}</span>
                </span>
              </button>
            )}
          </div>

          <button className="medicine-row" onClick={() => logEvent('medicine', 'Medicine')}>
            <span className="medicine-label">
              <Icon name="medicine" />
              Medicine
            </span>
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

          <div className="card-row">
            <div className="card">
              <button className="section-title section-toggle" onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
                <span>Upcoming</span>
                <span className={`chevron ${moreOpen ? 'open' : ''}`}>{'>'}</span>
              </button>
              {moreOpen && (
                <>
                  <MoreRow label="Feed" status={status.feed} timezone={timezone} statusKey="feed" onExplain={setExplainKey} />
                  <MoreRow label="Diaper" status={status.diaper} timezone={timezone} statusKey="diaper" onExplain={setExplainKey} />
                  <MoreRow label="Nap" status={status.nap} timezone={timezone} asleepLabel="Napping" statusKey="nap" onExplain={setExplainKey} />
                  <NightSleepRow
                    status={status.sleep}
                    timezone={timezone}
                    pattern={bedtimeInfo}
                    patternOpen={bedtimePatternOpen}
                    onTogglePattern={() => setBedtimePatternOpen(o => !o)}
                    onExplain={setExplainKey}
                  />
                  <div className="status-row">
                    <div>
                      <div className="status-label">
                        Medicine
                        <button type="button" className="why-btn" onClick={() => setExplainKey('medicine')} aria-label="Why Medicine?">Why?</button>
                      </div>
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
              <button className="section-title section-toggle" onClick={() => setActivityOpen(o => !o)} aria-expanded={activityOpen}>
                <span>Recent activity</span>
                <span className={`chevron ${activityOpen ? 'open' : ''}`}>{'>'}</span>
              </button>
              {activityOpen && (
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
                                <span className="activity-type">{TYPE_LABELS[item.type] || item.type}{activityDetailSuffix(item.raw)}</span>
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
            {editType === 'feed' && (
              <select className="modal-select" value={editFeedOunces} onChange={e => setEditFeedOunces(e.target.value)}>
                <option value="">No amount logged</option>
                {FEED_OUNCE_OPTIONS.map(oz => (
                  <option key={oz} value={oz}>{oz} oz</option>
                ))}
              </select>
            )}
            {editType === 'diaper' && (
              <select className="modal-select" value={editDiaperDetail} onChange={e => setEditDiaperDetail(e.target.value)}>
                <option value="">No detail logged</option>
                <option value="pee">Pee</option>
                <option value="poop">Poop</option>
                <option value="both">Both</option>
              </select>
            )}
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

      {feedPickerOpen && (
        <div className="modal-overlay" onClick={() => setFeedPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">How many ounces?</div>
            <div className="picker-grid">
              {FEED_OUNCE_OPTIONS.map(oz => (
                <button
                  key={oz}
                  className="picker-btn"
                  onClick={() => {
                    logEvent('feed', 'Fed', { feed_ounces: oz });
                    setFeedPickerOpen(false);
                  }}
                >
                  {oz} oz
                </button>
              ))}
            </div>
            <button
              className="modal-btn-skip"
              onClick={() => {
                logEvent('feed', 'Fed');
                setFeedPickerOpen(false);
              }}
            >
              Skip — just log the time
            </button>
          </div>
        </div>
      )}

      {diaperPickerOpen && (
        <div className="modal-overlay" onClick={() => setDiaperPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Diaper</div>
            <div className="picker-grid-3">
              <button
                className="picker-btn"
                onClick={() => {
                  logEvent('diaper', 'Diaper', { diaper_detail: 'pee' });
                  setDiaperPickerOpen(false);
                }}
              >
                Pee
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  logEvent('diaper', 'Diaper', { diaper_detail: 'poop' });
                  setDiaperPickerOpen(false);
                }}
              >
                Poop
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  logEvent('diaper', 'Diaper', { diaper_detail: 'both' });
                  setDiaperPickerOpen(false);
                }}
              >
                Both
              </button>
            </div>
            <button
              className="modal-btn-skip"
              onClick={() => {
                logEvent('diaper', 'Diaper');
                setDiaperPickerOpen(false);
              }}
            >
              Skip — just log the time
            </button>
          </div>
        </div>
      )}

      {explainKey && status && (
        <div className="modal-overlay" onClick={() => setExplainKey(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">How this is estimated</div>
            <div className="explain-body">{explainStatus(explainKey, status[explainKey], config, timezone)}</div>
            <button className="modal-btn-confirm form-save" onClick={() => setExplainKey(null)}>Got it</button>
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

// Night sleep gets its own row (instead of the generic MoreRow) so it can
// carry a second, collapsible "Bedtime pattern" dropdown underneath the
// usual label/detail line — the historical actual-bedtime pattern, shown
// alongside the Target-bedtime-driven due/overdue status, not replacing it.
function NightSleepRow({ status, timezone, pattern, patternOpen, onTogglePattern, onExplain }) {
  const detail = status.asleep
    ? `Asleep since ${formatLocalTime(status.lastEventTime, timezone)}`
    : status.dueAt
      ? formatLocalTime(status.dueAt, timezone)
      : 'On track';
  const toneClass = status.asleep ? 'muted' : status.state === 'overdue' ? 'overdue' : status.state === 'due-soon' ? 'due-soon' : 'muted';

  return (
    <div className="status-row-block">
      <div className="status-row">
        <div>
          <div className="status-label">
            Night sleep
            <button type="button" className="why-btn" onClick={() => onExplain('sleep')} aria-label="Why Night sleep?">Why?</button>
          </div>
        </div>
        <span className={`more-detail ${toneClass}`}>{detail}</span>
      </div>
      <button type="button" className="pattern-toggle" onClick={onTogglePattern} aria-expanded={patternOpen}>
        <span>Bedtime pattern</span>
        <span className={`chevron ${patternOpen ? 'open' : ''}`}>{'>'}</span>
      </button>
      {patternOpen && pattern && (
        <div className="pattern-dropdown">
          {pattern.sampleCount < 3 ? (
            <div className="pattern-line">
              Not enough bedtime history yet ({pattern.sampleCount} night{pattern.sampleCount === 1 ? '' : 's'} logged) — keep logging and a pattern will show up here.
            </div>
          ) : (
            <>
              <div className="pattern-line">
                Based on her last {pattern.sampleCount} nights, she usually goes down around {formatMinutesAsClock(pattern.meanMinutes)} (±{Math.round(pattern.spreadMinutes)} min).
              </div>
              <div className={`pattern-line ${pattern.overdue ? 'overdue' : ''}`}>
                {pattern.overdue
                  ? "That's past her usual window for tonight, based on pattern alone."
                  : `Tonight's pattern-based window: around ${formatLocalTime(pattern.estimateAt, timezone)}.`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MoreRow({ label, status, timezone, asleepLabel, statusKey, onExplain }) {
  const detail = status.asleep
    ? `${asleepLabel} since ${formatLocalTime(status.lastEventTime, timezone)}`
    : status.dueAt
      ? formatLocalTime(status.dueAt, timezone)
      : 'On track';
  const toneClass = status.asleep ? 'muted' : status.state === 'overdue' ? 'overdue' : status.state === 'due-soon' ? 'due-soon' : 'muted';
  return (
    <div className="status-row">
      <div>
        <div className="status-label">
          {label}
          <button type="button" className="why-btn" onClick={() => onExplain(statusKey)} aria-label={`Why ${label}?`}>Why?</button>
        </div>
      </div>
      <span className={`more-detail ${toneClass}`}>{detail}</span>
    </div>
  );
}
