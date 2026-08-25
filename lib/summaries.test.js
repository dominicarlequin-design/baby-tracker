// Plain-assertion checks for lib/summaries.js. Run with: node lib/summaries.test.js
import assert from 'node:assert/strict';
import { dailySummaries } from './summaries.js';

const config = { timezone: 'America/New_York' };

function localIso(dateStr, timeStr) {
  // America/New_York is UTC-4 (EDT) in August; encode times directly in UTC
  // offset by 4h so the resulting local wall-clock time is exactly as given.
  return new Date(`${dateStr}T${timeStr}:00-04:00`).toISOString();
}

// Basic counts and nap pairing land on the expected local day.
{
  const events = [
    { id: 1, type: 'feed', event_time: localIso('2026-08-20', '08:00') },
    { id: 2, type: 'feed', event_time: localIso('2026-08-20', '11:00') },
    { id: 3, type: 'diaper', event_time: localIso('2026-08-20', '09:00') },
    { id: 4, type: 'nap_start', event_time: localIso('2026-08-20', '13:00') },
    { id: 5, type: 'nap_end', event_time: localIso('2026-08-20', '14:30') },
  ];
  const summaries = dailySummaries(events, config, 30);
  const day = summaries.find(s => s.date === '2026-08-20');
  assert.ok(day, 'expected a summary for 2026-08-20');
  assert.equal(day.feeds, 2);
  assert.equal(day.diapers, 1);
  assert.equal(day.naps, 1);
  assert.equal(day.napMinutes, 90);
  assert.equal(day.avgFeedGapHours, 3);
}

// An unmatched nap_start (still asleep, or a missing end tap) must not
// produce a negative or absurd duration, and must not be counted as a nap.
{
  const events = [
    { id: 1, type: 'nap_start', event_time: localIso('2026-08-21', '13:00') },
    // no matching nap_end at all
    { id: 2, type: 'nap_start', event_time: localIso('2026-08-21', '16:00') },
    { id: 3, type: 'nap_end', event_time: localIso('2026-08-21', '16:30') },
  ];
  const summaries = dailySummaries(events, config, 30);
  const day = summaries.find(s => s.date === '2026-08-21');
  assert.equal(day.naps, 1, 'only the completed nap_start/nap_end pair should count');
  assert.equal(day.napMinutes, 30);
  assert.ok(day.napMinutes >= 0, 'napMinutes must never go negative');
}

// A stray nap_end with no pending start must be ignored, not paired
// backwards with an unrelated earlier event.
{
  const events = [
    { id: 1, type: 'nap_end', event_time: localIso('2026-08-22', '10:00') },
    { id: 2, type: 'nap_start', event_time: localIso('2026-08-22', '13:00') },
    { id: 3, type: 'nap_end', event_time: localIso('2026-08-22', '13:45') },
  ];
  const summaries = dailySummaries(events, config, 30);
  const day = summaries.find(s => s.date === '2026-08-22');
  assert.equal(day.naps, 1);
  assert.equal(day.napMinutes, 45);
}

// A bedtime just after midnight is grouped with the evening before (the
// noon-to-noon "night" bucket), not split onto the next calendar day.
{
  const events = [
    { id: 1, type: 'sleep_start', event_time: localIso('2026-08-23', '23:45') },
    { id: 2, type: 'sleep_end', event_time: localIso('2026-08-24', '06:15') },
  ];
  const summaries = dailySummaries(events, config, 30);
  const night = summaries.find(s => s.date === '2026-08-23');
  const nextDay = summaries.find(s => s.date === '2026-08-24');
  assert.equal(night.nightSleepMinutes, 390, '6.5h night sleep should land on the bedtime day');
  assert.equal(night.bedtime, localIso('2026-08-23', '23:45'));
  assert.equal(nextDay.nightSleepMinutes, 0, 'the wake day itself should not double-count the same stretch');
}

// longestNightStretchMinutes tracks the single longest stretch, distinct
// from the summed nightSleepMinutes, when a night has multiple stretches.
{
  const events = [
    { id: 1, type: 'sleep_start', event_time: localIso('2026-08-24', '19:15') },
    { id: 2, type: 'sleep_end', event_time: localIso('2026-08-25', '01:15') },   // 6h stretch
    { id: 3, type: 'sleep_start', event_time: localIso('2026-08-25', '01:45') },
    { id: 4, type: 'sleep_end', event_time: localIso('2026-08-25', '06:45') },   // 5h stretch
  ];
  const summaries = dailySummaries(events, config, 30);
  const night = summaries.find(s => s.date === '2026-08-24');
  assert.equal(night.nightSleepMinutes, 11 * 60, 'total should sum both stretches');
  assert.equal(night.longestNightStretchMinutes, 6 * 60, 'longest should be the single 6h stretch, not the 11h total');
}

console.log('All summaries tests passed.');
