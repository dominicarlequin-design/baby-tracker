// Status computation for the baby tracker.

// ---------------------------------------------------------------------------
// Core building blocks
// ---------------------------------------------------------------------------

// Most recent event matching `types` (a single type string, or an array of
// type strings). Returns null if none found.
export function lastEventOf(events, types) {
  const typeSet = new Set(Array.isArray(types) ? types : [types]);
  let latest = null;
  let latestMs = -Infinity;
  for (const e of events) {
    if (!typeSet.has(e.type)) continue;
    const ms = new Date(e.event_time).getTime();
    if (ms > latestMs) {
      latestMs = ms;
      latest = e;
    }
  }
  return latest;
}

// Minimum sample count before robustAverage() will trim anything. Below
// this there isn't enough history to tell a real outlier from ordinary
// sample noise, so a 2-3 interval window (a brand new baby_config, or a
// just-added event type) behaves exactly as a plain average always did.
const MIN_SAMPLES_FOR_TRIMMING = 6;

// How many "robust standard deviations" (median absolute deviation, scaled
// to be comparable to a stdev for roughly normal data) a sample may sit from
// the median before it's treated as an outlier and dropped.
const OUTLIER_DEVIATIONS = 2.5;

function median(sortedValues) {
  const n = sortedValues.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
}

// Outlier-resistant average: with enough samples, drops any that sit far
// from the median (a missed log, a growth-spurt cluster feed, one rough
// night) before averaging the rest, so a single unusual gap doesn't swing
// the due-time estimate the way a plain average would. Falls back to a
// plain average below MIN_SAMPLES_FOR_TRIMMING, and never drops every
// sample even if they're all equal (mad === 0, so nothing looks like an
// outlier relative to a zero spread).
function robustAverage(values) {
  if (values.length < MIN_SAMPLES_FOR_TRIMMING) {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const deviations = sorted.map(v => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = median(deviations) * 1.4826;
  const kept = mad > 0 ? values.filter(v => Math.abs(v - med) <= OUTLIER_DEVIATIONS * mad) : values;
  const use = kept.length ? kept : values;
  return use.reduce((sum, v) => sum + v, 0) / use.length;
}

// Rolling average interval (in hours) between consecutive events of `type`,
// using at most the most recent `maxSamples` intervals, averaged with
// robustAverage() so one unusually long or short gap doesn't dominate.
// Falls back to `fallbackHours` when there's fewer than 2 events of that
// type (i.e. not enough history to derive even one interval).
export function rollingIntervalHours(events, type, maxSamples, fallbackHours) {
  const timesMs = events
    .filter(e => e.type === type)
    .map(e => new Date(e.event_time).getTime())
    .sort((a, b) => a - b);

  if (timesMs.length < 2) return fallbackHours;

  const intervalsHours = [];
  for (let i = 1; i < timesMs.length; i++) {
    intervalsHours.push((timesMs[i] - timesMs[i - 1]) / (1000 * 60 * 60));
  }

  const recent = intervalsHours.slice(-maxSamples);
  return robustAverage(recent);
}

// ---------------------------------------------------------------------------
// Timezone helpers (no external tz library; Intl-based)
// ---------------------------------------------------------------------------

export function localDateStr(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

export function getTimezoneOffsetMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour24 = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour24, Number(map.minute), Number(map.second));
  return (asUTC - date.getTime()) / 60000;
}

// UTC instant corresponding to local wall-clock `dateStr` ("YYYY-MM-DD") +
// `timeStr` ("HH:MM") in `timezone`. Handles DST via two-pass refinement.
export function localDateTimeToUtc(dateStr, timeStr, timezone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(naiveUtcMs);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getTimezoneOffsetMinutes(guess, timezone);
    guess = new Date(naiveUtcMs - offsetMinutes * 60000);
  }
  return guess;
}

// Inverse of localDateTimeToUtc: renders an ISO instant as "YYYY-MM-DDTHH:MM"
// wall-clock in `timezone`, suitable for an <input type="datetime-local">.
export function isoToLocalDatetimeInputValue(iso, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Calendar age in whole months + remaining days, computed the way a
// pediatrician would state it ("4 months, 25 days") rather than a flat
// days/30 average — so a 31-day month doesn't quietly shortchange her age.
// `birthDateStr` is "YYYY-MM-DD"; age is measured against `now`'s calendar
// date in `timezone`, not UTC, so it doesn't flip a day early/late for
// timezones behind/ahead of UTC. Returns null if there's no birth date yet.
export function ageInMonths(birthDateStr, now, timezone) {
  if (!birthDateStr) return null;
  const [by, bm, bd] = birthDateStr.split('-').map(Number);
  const nowStr = localDateStr(now, timezone);
  const [ny, nm, nd] = nowStr.split('-').map(Number);

  let months = (ny - by) * 12 + (nm - bm);
  let days = nd - bd;
  if (days < 0) {
    months -= 1;
    // Days in the month immediately before `now`'s month (day 0 of `nm`
    // rolls back to the last day of `nm - 1`, handling January correctly
    // since Date.UTC wraps month -1 into the prior year).
    const prevMonthLastDay = new Date(Date.UTC(ny, nm - 1, 0)).getUTCDate();
    days += prevMonthLastDay;
  }
  if (months < 0) return null; // birth date in the future — treat as unset

  return { months, days, decimalMonths: months + days / 30.4368 };
}

// ---------------------------------------------------------------------------
// Per-category status
// ---------------------------------------------------------------------------

// Three-way read on how close something is to (or past) its due time.
// Below 80% of the way to `dueAt` is on-track; from 80% up to
// `avgHours * overdueMultiplier` is due-soon (still ordinary — roughly half
// of all real intervals land past their own average); only past the
// multiplier does it become overdue.
function classifyState(hoursSince, avgHours, overdueMultiplier) {
  if (hoursSince == null || !(avgHours > 0)) return 'on-track';
  if (hoursSince > avgHours * overdueMultiplier) return 'overdue';
  if (hoursSince >= avgHours * 0.8) return 'due-soon';
  return 'on-track';
}

// feed / diaper: due at last-event-time + rolling average interval, judged
// with the three-way state above.
function intervalStatus({ events, type, maxSamples, fallbackHours, overdueMultiplier, now }) {
  const last = lastEventOf(events, type);
  const avgHours = rollingIntervalHours(events, type, maxSamples, fallbackHours);

  if (!last) {
    return { state: 'on-track', overdue: false, lastEventTime: null, avgHours, hoursSince: null, dueAt: null };
  }

  const lastMs = new Date(last.event_time).getTime();
  const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
  const dueAt = new Date(lastMs + avgHours * 60 * 60 * 1000);
  const state = classifyState(hoursSince, avgHours, overdueMultiplier);

  return {
    state,
    overdue: state === 'overdue',
    lastEventTime: last.event_time,
    avgHours,
    hoursSince,
    dueAt: dueAt.toISOString(),
  };
}

// Wake-window samples for naps: hours from each nap_end to the
// chronologically next nap_start. Using nap_end -> next nap_end would
// include the following nap's own length in the "wake window"; pairing
// end -> start instead isolates just the awake time between naps.
//
// Night sleep events are included in the same sorted stream (though never
// themselves turned into windows) specifically so a nap_end is *not* paired
// across an intervening bedtime with the next morning's first nap_start —
// without that, the last nap of the day and the first nap of the next
// would be "paired" into one multi-hour wake window that's actually mostly
// a full night's sleep. Found by comparing against real event history,
// where it was inflating the average by several hours.
//
// Exported (with the underlying timestamps, not just the hours) so
// lib/summaries.js can bucket the same windows by day without re-deriving
// the pairing.
export function napWakeWindows(events) {
  const relevant = events
    .filter(e => e.type === 'nap_start' || e.type === 'nap_end' || e.type === 'sleep_start' || e.type === 'sleep_end')
    .map(e => ({ type: e.type, ms: new Date(e.event_time).getTime() }))
    .sort((a, b) => a.ms - b.ms);

  const windows = [];
  for (let i = 0; i < relevant.length - 1; i++) {
    if (relevant[i].type === 'nap_end' && relevant[i + 1].type === 'nap_start') {
      windows.push({
        endMs: relevant[i].ms,
        startMs: relevant[i + 1].ms,
        hours: (relevant[i + 1].ms - relevant[i].ms) / (1000 * 60 * 60),
      });
    }
  }
  return windows;
}

function napStatus({ events, maxSamples, fallbackHours, overdueMultiplier, now }) {
  const lastNapStart = lastEventOf(events, 'nap_start');
  const lastNapEnd = lastEventOf(events, 'nap_end');
  const currentlyAsleep = !!lastNapStart && (!lastNapEnd || new Date(lastNapStart.event_time) > new Date(lastNapEnd.event_time));

  const recentWindows = napWakeWindows(events).slice(-maxSamples).map(w => w.hours);
  const avgHours = recentWindows.length ? robustAverage(recentWindows) : fallbackHours;

  if (currentlyAsleep) {
    return {
      state: 'on-track', overdue: false, asleep: true,
      lastEventTime: lastNapStart.event_time, avgHours, hoursSince: null, dueAt: null,
    };
  }

  if (!lastNapEnd) {
    return { state: 'on-track', overdue: false, asleep: false, lastEventTime: null, avgHours, hoursSince: null, dueAt: null };
  }

  const lastMs = new Date(lastNapEnd.event_time).getTime();
  const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
  const dueAt = new Date(lastMs + avgHours * 60 * 60 * 1000);
  const state = classifyState(hoursSince, avgHours, overdueMultiplier);

  return {
    state,
    overdue: state === 'overdue',
    asleep: false,
    lastEventTime: lastNapEnd.event_time,
    avgHours,
    hoursSince,
    dueAt: dueAt.toISOString(),
  };
}

// Night sleep isn't a repeating interval the way feeds/diapers/naps are —
// there's exactly one per day, so "average time since the last one" is
// meaningless (it's always ~24h). Judge it against a wall-clock target
// bedtime instead: on-track before it, due-soon once past it, overdue once
// past it by more than the grace period, all while no sleep_start has been
// logged for that slot yet.
function nightSleepStatus({ events, config, now }) {
  const { timezone, target_bedtime_local, medicine_grace_minutes } = config;
  const lastSleepStart = lastEventOf(events, 'sleep_start');
  const lastSleepEnd = lastEventOf(events, 'sleep_end');
  const currentlyAsleep = !!lastSleepStart && (!lastSleepEnd || new Date(lastSleepStart.event_time) > new Date(lastSleepEnd.event_time));

  if (currentlyAsleep) {
    const hoursSince = (now.getTime() - new Date(lastSleepStart.event_time).getTime()) / (1000 * 60 * 60);
    return {
      state: 'on-track', overdue: false, asleep: true,
      lastEventTime: lastSleepStart.event_time, avgHours: null, hoursSince, dueAt: null,
    };
  }

  // Yesterday/today/tomorrow's target-bedtime instants. Three days (not
  // just today+yesterday) so nextSlot is always resolvable, including late
  // at night after tonight's bedtime has already come and been kept.
  let lastSlot = null;
  let nextSlot = null;
  for (const dayOffset of [-1, 0, 1]) {
    const dayStr = localDateStr(addDays(now, dayOffset), timezone);
    const slot = localDateTimeToUtc(dayStr, target_bedtime_local, timezone);
    if (slot.getTime() <= now.getTime()) {
      if (!lastSlot || slot.getTime() > lastSlot.getTime()) lastSlot = slot;
    } else if (!nextSlot || slot.getTime() < nextSlot.getTime()) {
      nextSlot = slot;
    }
  }

  const lastEventTime = lastSleepEnd ? lastSleepEnd.event_time : null;

  if (!lastSlot) {
    return { state: 'on-track', overdue: false, asleep: false, lastEventTime, avgHours: null, hoursSince: null, dueAt: nextSlot.toISOString() };
  }

  const sleptSinceSlot = !!lastSleepStart && new Date(lastSleepStart.event_time).getTime() >= lastSlot.getTime();
  if (sleptSinceSlot) {
    // On-track for the rest of the day: dueAt previews the next bedtime
    // (informational only — state stays on-track, nothing is due yet).
    return { state: 'on-track', overdue: false, asleep: false, lastEventTime, avgHours: null, hoursSince: null, dueAt: nextSlot ? nextSlot.toISOString() : null };
  }

  const graceDeadline = new Date(lastSlot.getTime() + medicine_grace_minutes * 60 * 1000);
  const minutesPastSlot = (now.getTime() - lastSlot.getTime()) / 60000;
  const state = now.getTime() > graceDeadline.getTime() ? 'overdue' : 'due-soon';

  return {
    state,
    overdue: state === 'overdue',
    asleep: false,
    lastEventTime,
    avgHours: null,
    hoursSince: minutesPastSlot / 60,
    dueAt: lastSlot.toISOString(),
  };
}

// medicine: schedule-based against medicine_times_local (+ grace), not
// interval-based. Overdue once the most recent scheduled local dose time has
// passed its grace deadline without a medicine event logged at/after it.
function medicineStatus({ events, config, now }) {
  const { medicine_times_local, medicine_grace_minutes, timezone } = config;
  const medicineEvents = events.filter(e => e.type === 'medicine');

  // Every scheduled slot from today and yesterday (yesterday catches a slot
  // like 00:00 that "belongs" to the previous local day at this instant)
  // that has already occurred, most recent first.
  const passedSlots = [];
  for (const dayOffset of [0, -1]) {
    const dayStr = localDateStr(addDays(now, dayOffset), timezone);
    for (const t of medicine_times_local) {
      const slot = localDateTimeToUtc(dayStr, t, timezone);
      if (slot.getTime() <= now.getTime()) passedSlots.push(slot);
    }
  }
  passedSlots.sort((a, b) => b.getTime() - a.getTime());
  const lastSlot = passedSlots[0] || null;

  if (!lastSlot) {
    return { overdue: false, lastScheduledSlot: null, graceDeadline: null };
  }

  const graceDeadline = new Date(lastSlot.getTime() + medicine_grace_minutes * 60 * 1000);
  const givenForSlot = medicineEvents.some(e => new Date(e.event_time).getTime() >= lastSlot.getTime());
  const overdue = !givenForSlot && now.getTime() > graceDeadline.getTime();

  return {
    overdue,
    lastScheduledSlot: lastSlot.toISOString(),
    graceDeadline: graceDeadline.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Computes status for every tracked category from raw events + config.
// `events` should be the full baby_events history (or at least enough of it
// to cover rolling_average_max_samples + 1 events per type); `config` is the
// single baby_config row; `now` defaults to the current time but can be
// overridden (e.g. by the cron job, or tests).
// Feed and sleep (nap wake-window) intervals get a bigger sample window than
// the configured default — they're the two parents watch most closely, and
// more history plus robustAverage()'s outlier trimming means one rough
// night or one cluster-fed evening doesn't visibly swing the due time.
// Diaper keeps using the plain configured sample count.
const EXTRA_HISTORY_SAMPLES = 12;

export function computeStatus(events, config, now = new Date()) {
  const maxSamples = config.rolling_average_max_samples;
  const overdueMultiplier = config.overdue_multiplier ?? 1.25;
  const historySamples = Math.max(maxSamples, EXTRA_HISTORY_SAMPLES);

  const feed = intervalStatus({
    events, type: 'feed', maxSamples: historySamples, fallbackHours: config.feed_fallback_hours, overdueMultiplier, now,
  });

  const diaper = intervalStatus({
    events, type: 'diaper', maxSamples, fallbackHours: config.diaper_fallback_hours, overdueMultiplier, now,
  });

  const nap = napStatus({
    events, maxSamples: historySamples, fallbackHours: config.wake_window_fallback_hours, overdueMultiplier, now,
  });

  const sleep = nightSleepStatus({
    events,
    config: { ...config, target_bedtime_local: config.target_bedtime_local ?? '19:15' },
    now,
  });

  const medicine = medicineStatus({ events, config, now });

  return { feed, diaper, nap, sleep, medicine };
}
