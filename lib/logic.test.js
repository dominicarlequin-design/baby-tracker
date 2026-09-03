// Plain-assertion checks for lib/logic.js. Run with: node lib/logic.test.js
import assert from 'node:assert/strict';
import { computeStatus, ageInMonths } from './logic.js';

function iso(base, hoursOffset) {
  return new Date(base.getTime() + hoursOffset * 60 * 60 * 1000).toISOString();
}

const config = {
  timezone: 'America/New_York',
  rolling_average_max_samples: 5,
  feed_fallback_hours: 3,
  diaper_fallback_hours: 2,
  wake_window_fallback_hours: 1.5,
  medicine_times_local: ['08:00', '20:00'],
  medicine_grace_minutes: 30,
  overdue_multiplier: 1.25,
  target_bedtime_local: '19:15',
};

// A normal feed gap (right at the rolling average) must not read as overdue.
// This is the bug: half of all real intervals exceed their own average, so
// the old `hoursSince > avgHours` check fired on ordinary behavior.
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'feed', event_time: iso(base, -9) },
    { id: 2, type: 'feed', event_time: iso(base, -6) },
    { id: 3, type: 'feed', event_time: iso(base, -3) }, // avg gap so far: 3h
  ];
  const status = computeStatus(events, config, new Date(iso(base, 0))); // 3h since last feed = exactly the average
  assert.equal(status.feed.overdue, false, 'a gap equal to the average must not be flagged overdue');
  assert.equal(status.feed.state, 'due-soon', 'a gap equal to the average should read as due-soon');
}

// A 1.5x gap (above the 1.25x overdue_multiplier) must flag overdue.
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'feed', event_time: iso(base, -9) },
    { id: 2, type: 'feed', event_time: iso(base, -6) },
    { id: 3, type: 'feed', event_time: iso(base, -3) }, // avg gap: 3h
  ];
  const status = computeStatus(events, config, new Date(iso(base, 1.5))); // 4.5h since last feed = 1.5x
  assert.equal(status.feed.overdue, true, 'a 1.5x gap must be flagged overdue');
  assert.equal(status.feed.state, 'overdue');
}

// Nap wake window must be measured nap_end -> next nap_start, not
// nap_end -> next nap_end (which would fold the following nap's own length
// into the "wake window" and overstate it).
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'nap_start', event_time: iso(base, -10) },
    { id: 2, type: 'nap_end', event_time: iso(base, -9.5) },  // 30m nap
    { id: 3, type: 'nap_start', event_time: iso(base, -7.5) }, // 2h awake in between
    { id: 4, type: 'nap_end', event_time: iso(base, -7) },     // 30m nap
  ];
  const status = computeStatus(events, config, new Date(iso(base, -7)));
  assert.equal(status.nap.avgHours, 2, 'wake window must be the 2h end->start gap, not the 2.5h end->end gap');
}

// A nap_end followed by the *next day's* first nap_start, with a full
// night's sleep in between, must not be counted as one giant wake window —
// only a same-day nap_end -> nap_start gap (with no intervening bedtime)
// should count. Caught against real production data: without excluding
// intervening night sleep, the overnight gap inflated the average wake
// window by several hours.
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'nap_start', event_time: iso(base, -30) },
    { id: 2, type: 'nap_end', event_time: iso(base, -29) },     // day 1 nap
    { id: 3, type: 'sleep_start', event_time: iso(base, -27) }, // bedtime that evening
    { id: 4, type: 'sleep_end', event_time: iso(base, -17) },   // wake up the next morning
    { id: 5, type: 'nap_start', event_time: iso(base, -15) },   // day 2's first nap
    { id: 6, type: 'nap_end', event_time: iso(base, -14) },     // (nap_end(-29) -> this nap_start(-15) would be a bogus 14h "window")
    { id: 7, type: 'nap_start', event_time: iso(base, -11) },   // day 2's second nap, 3h after the prior nap_end, same day
    { id: 8, type: 'nap_end', event_time: iso(base, -10) },
  ];
  const status = computeStatus(events, config, new Date(iso(base, -10)));
  assert.equal(status.nap.avgHours, 3, 'only the genuine same-day 3h gap should count; the 14h overnight gap must be excluded');
}

// Night sleep must never derive its window from the sleep_end -> sleep_end
// interval (which is ~24h and can never fire as overdue); it's judged
// against target_bedtime_local instead.
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'sleep_start', event_time: iso(base, -48) },
    { id: 2, type: 'sleep_end', event_time: iso(base, -41) },
    { id: 3, type: 'sleep_start', event_time: iso(base, -24) },
    { id: 4, type: 'sleep_end', event_time: iso(base, -17) }, // sleep_end -> sleep_end gap here is 24h
  ];
  const status = computeStatus(events, config, new Date(iso(base, -10)));
  assert.notEqual(status.sleep.avgHours, 24, 'night sleep must not report a ~24h interval as its window');
  assert.equal(status.sleep.avgHours, null, 'night sleep has no rolling-average window; it is judged against target_bedtime_local');
}

// Feed's rolling average must trim a one-off outlier gap (e.g. a missed log,
// or one unusually long stretch) rather than let it drag the whole average,
// once there's enough history (>= MIN_SAMPLES_FOR_TRIMMING) to tell a real
// outlier apart from ordinary noise. Six ~3h gaps plus one 20h gap: a plain
// average would land around 5.4h; robustAverage should exclude the 20h
// outlier and land close to the ~3h gaps' own average (~2.98h).
{
  const base = new Date('2026-08-25T00:00:00Z');
  const events = [
    { id: 1, type: 'feed', event_time: iso(base, -37.9) },
    { id: 2, type: 'feed', event_time: iso(base, -17.9) }, // 20h gap (the outlier)
    { id: 3, type: 'feed', event_time: iso(base, -14.4) }, // 3.5h gap
    { id: 4, type: 'feed', event_time: iso(base, -11.9) }, // 2.5h gap
    { id: 5, type: 'feed', event_time: iso(base, -8.7) },  // 3.2h gap
    { id: 6, type: 'feed', event_time: iso(base, -5.9) },  // 2.8h gap
    { id: 7, type: 'feed', event_time: iso(base, -2.9) },  // 3h gap
    { id: 8, type: 'feed', event_time: iso(base, 0) },     // 2.9h gap
  ];
  const status = computeStatus(events, config, new Date(iso(base, 0)));
  const plainAverage = 37.9 / 7;
  assert.ok(
    Math.abs(status.feed.avgHours - 2.9833) < 0.01,
    `expected the 20h outlier to be trimmed (~2.98h), got ${status.feed.avgHours}`
  );
  assert.ok(
    Math.abs(status.feed.avgHours - plainAverage) > 1,
    'robust average should differ meaningfully from the outlier-skewed plain average'
  );
}

// ageInMonths: born 2026-04-09, checked on 2026-09-03 (6 days before her
// 5-month mark) should read 4 months, 25 days — not yet 5 months. This is
// the exact case that drives the Patterns "How she compares" card picking
// the right age bracket right up until her actual month-birthday.
{
  const age = ageInMonths('2026-04-09', new Date('2026-09-03T12:00:00-04:00'), 'America/New_York');
  assert.equal(age.months, 4, 'should be 4 whole months on Sept 3, not yet 5');
  assert.equal(age.days, 25, 'should be 25 days into the 5th month');
}

// The same birth date checked ON her 5-month mark (Sept 9) should roll over
// to exactly 5 months, 0 days — the bracket switch has to land on the day,
// not a day early or late.
{
  const age = ageInMonths('2026-04-09', new Date('2026-09-09T12:00:00-04:00'), 'America/New_York');
  assert.equal(age.months, 5, 'should be exactly 5 months on her month-birthday');
  assert.equal(age.days, 0);
}

// No birth date set yet -> null, so callers can fall back gracefully
// instead of crashing on a missing config field.
{
  assert.equal(ageInMonths(null, new Date(), 'America/New_York'), null);
}

console.log('All logic tests passed.');
