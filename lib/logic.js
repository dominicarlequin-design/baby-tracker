// Status computation for the baby tracker.
//
// NOTE ON PROVENANCE: this file was reconstructed from a description of app
// behavior rather than the original source (which was unavailable at the
// time of writing). The four function names/signatures below
// (rollingIntervalHours, lastEventOf, computeStatus) were
// given as the existing contract to preserve; everything else is this
// reconstruction's own design. The most judgment-call-heavy piece is how
// "nap" and "night sleep" are computed (see sleepWindowStatus below) — that
// wasn't fully pinned down by the spec, so verify it against real usage and
// adjust if it doesn't match expectations.

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

// Rolling average interval (in hours) between consecutive events of `type`,
// using at most the most recent `maxSamples` intervals. Falls back to
// `fallbackHours` when there's fewer than 2 events of that type (i.e. not
// enough history to derive even one interval).
export function rollingIntervalHours(events, type, maxSamples, fallbackHours) {
  const timesMs = events
    .filter(e => e.type === type)
    .map(e => new Date(e.event_time).getTime())
    .sort((a, b) => a - b);

  if (timesMs.length < 2) return fallbackHours;

  const intervalsMs = [];
  for (let i = 1; i < timesMs.length; i++) {
    intervalsMs.push(timesMs[i] - timesMs[i - 1]);
  }

  const recent = intervalsMs.slice(-maxSamples);
  const avgMs = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
  return avgMs / (1000 * 60 * 60);
}

// ---------------------------------------------------------------------------
// Timezone helpers (no external tz library; Intl-based)
// ---------------------------------------------------------------------------

function localDateStr(date, timezone) {
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

// ---------------------------------------------------------------------------
// Per-category status
// ---------------------------------------------------------------------------

// feed / diaper: overdue once time since the last event of `type` exceeds
// the rolling average interval between events of that type (or the fallback
// when there isn't enough history yet).
function intervalStatus({ events, type, maxSamples, fallbackHours, now }) {
  const last = lastEventOf(events, type);
  const avgHours = rollingIntervalHours(events, type, maxSamples, fallbackHours);

  if (!last) {
    return { overdue: false, lastEventTime: null, avgHours, hoursSince: null, dueAt: null };
  }

  const lastMs = new Date(last.event_time).getTime();
  const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
  const dueAt = new Date(lastMs + avgHours * 60 * 60 * 1000);

  return {
    overdue: hoursSince > avgHours,
    lastEventTime: last.event_time,
    avgHours,
    hoursSince,
    dueAt: dueAt.toISOString(),
  };
}

// nap / night sleep: a start/end pair rather than a single repeating event.
// If the most recent of {startType, endType} is a start with no later end,
// the baby is currently asleep -> never "overdue" (asleep = true instead).
// Otherwise, overdue once time since the last `endType` event exceeds the
// rolling average interval between consecutive `endType` events (a proxy
// for the typical full wake-to-wake cycle length), with `fallbackHours`
// (wake_window_fallback_hours) used until enough history exists.
function sleepWindowStatus({ events, startType, endType, maxSamples, fallbackHours, now }) {
  const lastStart = lastEventOf(events, startType);
  const lastEnd = lastEventOf(events, endType);

  const currentlyAsleep = !!lastStart && (!lastEnd || new Date(lastStart.event_time) > new Date(lastEnd.event_time));
  if (currentlyAsleep) {
    return {
      overdue: false, asleep: true, lastEventTime: lastStart.event_time,
      avgHours: null, hoursSince: null, dueAt: null,
    };
  }

  const avgHours = rollingIntervalHours(events, endType, maxSamples, fallbackHours);

  if (!lastEnd) {
    return { overdue: false, asleep: false, lastEventTime: null, avgHours, hoursSince: null, dueAt: null };
  }

  const lastMs = new Date(lastEnd.event_time).getTime();
  const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
  const dueAt = new Date(lastMs + avgHours * 60 * 60 * 1000);

  return {
    overdue: hoursSince > avgHours,
    asleep: false,
    lastEventTime: lastEnd.event_time,
    avgHours,
    hoursSince,
    dueAt: dueAt.toISOString(),
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
export function computeStatus(events, config, now = new Date()) {
  const maxSamples = config.rolling_average_max_samples;

  const feed = intervalStatus({
    events, type: 'feed', maxSamples, fallbackHours: config.feed_fallback_hours, now,
  });

  const diaper = intervalStatus({
    events, type: 'diaper', maxSamples, fallbackHours: config.diaper_fallback_hours, now,
  });

  const nap = sleepWindowStatus({
    events, startType: 'nap_start', endType: 'nap_end',
    maxSamples, fallbackHours: config.wake_window_fallback_hours, now,
  });

  const sleep = sleepWindowStatus({
    events, startType: 'sleep_start', endType: 'sleep_end',
    maxSamples, fallbackHours: config.wake_window_fallback_hours, now,
  });

  const medicine = medicineStatus({ events, config, now });

  return { feed, diaper, nap, sleep, medicine };
}
