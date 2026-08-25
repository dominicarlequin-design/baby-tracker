// Per-local-day rollups of raw events, for the Patterns screen and the
// "Today so far" card. Built on top of lib/logic.js's timezone helpers and
// nap-pairing logic rather than re-deriving them.
import { localDateStr, napWakeWindows } from './logic.js';

// Pairs consecutive start/end events of the given types, in chronological
// order. A start with no following end (baby still asleep, or a missed end
// tap) is dropped rather than paired with a later, unrelated end — that
// would either leave it unterminated (fine, it's just excluded) or produce
// a bogus multi-hour/negative duration if paired with the wrong event. A
// stray end with no pending start is likewise ignored.
function pairStartEnd(events, startType, endType) {
  const relevant = events
    .filter(e => e.type === startType || e.type === endType)
    .map(e => ({ type: e.type, time: new Date(e.event_time) }))
    .sort((a, b) => a.time - b.time);

  const pairs = [];
  let pendingStart = null;
  for (const e of relevant) {
    if (e.type === startType) {
      pendingStart = e.time;
    } else if (pendingStart) {
      pairs.push({ start: pendingStart, end: e.time });
      pendingStart = null;
    }
  }
  return pairs;
}

function average(samples) {
  return samples.length ? samples.reduce((sum, n) => sum + n, 0) / samples.length : null;
}

// A "night" runs roughly noon-to-noon rather than midnight-to-midnight, so a
// 1am wake-up gets grouped with the bedtime from the evening before instead
// of starting a new, dateless bucket of its own.
function nightKeyFor(date, timezone) {
  return localDateStr(new Date(date.getTime() - 12 * 60 * 60 * 1000), timezone);
}

// One rollup per local day, oldest first / most recent last, covering the
// `days` local days ending today. Partial or malformed data (an unmatched
// start, a day with no samples for a given average) is skipped for that
// field rather than throwing or reporting a misleading number.
export function dailySummaries(events, config, days) {
  const timezone = config.timezone || 'America/New_York';
  const now = new Date();

  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(localDateStr(new Date(now.getTime() - i * 24 * 60 * 60 * 1000), timezone));
  }
  const dayIndex = new Map(dayKeys.map((date, i) => [date, i]));

  const summaries = dayKeys.map(date => ({
    date,
    feeds: 0,
    diapers: 0,
    naps: 0,
    napMinutes: 0,
    nightSleepMinutes: 0,
    totalSleepMinutes: 0,
    longestNightStretchMinutes: 0,
    avgWakeWindowHours: null,
    avgFeedGapHours: null,
    bedtime: null,
  }));

  const wakeWindowSamples = dayKeys.map(() => []);
  const feedGapSamples = dayKeys.map(() => []);

  for (const e of events) {
    const idx = dayIndex.get(localDateStr(new Date(e.event_time), timezone));
    if (idx == null) continue;
    if (e.type === 'feed') summaries[idx].feeds++;
    else if (e.type === 'diaper') summaries[idx].diapers++;
  }

  const feedTimesMs = events
    .filter(e => e.type === 'feed')
    .map(e => new Date(e.event_time).getTime())
    .sort((a, b) => a - b);
  for (let i = 1; i < feedTimesMs.length; i++) {
    const idx = dayIndex.get(localDateStr(new Date(feedTimesMs[i - 1]), timezone));
    if (idx != null) feedGapSamples[idx].push((feedTimesMs[i] - feedTimesMs[i - 1]) / (1000 * 60 * 60));
  }

  for (const { start, end } of pairStartEnd(events, 'nap_start', 'nap_end')) {
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (minutes <= 0) continue;
    const idx = dayIndex.get(localDateStr(start, timezone));
    if (idx == null) continue;
    summaries[idx].naps++;
    summaries[idx].napMinutes += minutes;
  }

  for (const window of napWakeWindows(events)) {
    const idx = dayIndex.get(localDateStr(new Date(window.endMs), timezone));
    if (idx != null) wakeWindowSamples[idx].push(window.hours);
  }

  for (const { start, end } of pairStartEnd(events, 'sleep_start', 'sleep_end')) {
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (minutes <= 0) continue;
    const idx = dayIndex.get(nightKeyFor(start, timezone));
    if (idx == null) continue;
    const summary = summaries[idx];
    summary.nightSleepMinutes += minutes;
    summary.longestNightStretchMinutes = Math.max(summary.longestNightStretchMinutes, minutes);
    if (summary.bedtime == null) summary.bedtime = start.toISOString();
  }

  for (let i = 0; i < summaries.length; i++) {
    summaries[i].totalSleepMinutes = summaries[i].napMinutes + summaries[i].nightSleepMinutes;
    summaries[i].avgWakeWindowHours = average(wakeWindowSamples[i]);
    summaries[i].avgFeedGapHours = average(feedGapSamples[i]);
  }

  return summaries;
}
