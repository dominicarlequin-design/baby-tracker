// Plain-assertion checks for lib/visitSummary.js. Run with: node lib/visitSummary.test.js
import assert from 'node:assert/strict';
import { buildVisitSummary } from './visitSummary.js';

const config = { timezone: 'America/New_York' };
// dailySummaries reads the real clock, so events are placed relative to it.
const now = new Date();
const at = (back, hh, type, extra = {}) => {
  const d = new Date(now.getTime() - back * 86400000);
  d.setUTCHours(Number(hh), 0, 0, 0);
  return { type, event_time: d.toISOString(), ...extra };
};

const events = [];
for (const day of [4, 3, 2]) {
  events.push(at(day, '12', 'feed', { feed_ounces: 4 }), at(day, '16', 'feed', { feed_ounces: 5 }), at(day, '18', 'feed'));
  events.push(at(day, '13', 'diaper', { diaper_detail: 'pee' }), at(day, '19', 'diaper', { diaper_detail: 'both' }));
  events.push(at(day, '14', 'medicine'));
}
// Today is in progress and must not count.
events.push({ type: 'feed', event_time: now.toISOString(), feed_ounces: 8 });
events.push(at(2, '15', 'solid', { food_name: 'Pumpkin', food_reaction: 'none' }));

const s = buildVisitSummary(events, config, 7, now);
assert.equal(s.daysLogged, 3);              // three logged days, today and empty days left out
assert.equal(s.feeds.avg, 3);
assert.equal(s.feeds.min, 3);
assert.equal(s.diapers.avg, 2);
assert.equal(s.diapers.wet, 2);             // pee + both
assert.equal(s.diapers.dirty, 1);           // both
assert.equal(s.ounces.avg, 9);              // 4 + 5 oz recorded per day
assert.equal(s.medicine.total, 3);
assert.equal(s.solids.total, 1);
assert.equal(s.solids.newInRange.length, 1);
assert.equal(s.bedtime, null);

const empty = buildVisitSummary([], config, 7, now);
assert.equal(empty.daysLogged, 0);
assert.equal(empty.feeds.avg, null);

console.log('visitSummary tests passed.');
