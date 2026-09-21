// Plain-assertion checks for lib/notifications.js. Run with:
//   node lib/notifications.test.js
import assert from 'node:assert/strict';
import { decideOverdueNotifications } from './notifications.js';

const now = new Date('2026-09-18T12:00:00.000Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

// A brand-new overdue category (no prior state row) always notifies.
{
  const overdue = [{ key: 'feed', label: 'Feed', detail: 'Late by 20 minutes' }];
  const { toNotify, toClear } = decideOverdueNotifications(overdue, [], now);
  assert.equal(toNotify.length, 1);
  assert.equal(toNotify[0].key, 'feed');
  assert.equal(toClear.length, 0);
}

// Still overdue, notified 30 minutes ago, under the 3h reminder threshold:
// no repeat push yet.
{
  const overdue = [{ key: 'feed', label: 'Feed', detail: 'Late by 3 hours' }];
  const state = [{ category: 'feed', last_notified_at: hoursAgo(0.5) }];
  const { toNotify } = decideOverdueNotifications(overdue, state, now);
  assert.equal(toNotify.length, 0);
}

// Still overdue, last notified exactly at the reminder threshold: fires
// again (>= comparison, not >).
{
  const overdue = [{ key: 'medicine', label: 'Medicine', detail: 'Late by 3 hours' }];
  const state = [{ category: 'medicine', last_notified_at: hoursAgo(3) }];
  const { toNotify } = decideOverdueNotifications(overdue, state, now);
  assert.equal(toNotify.length, 1);
}

// A category that used to be overdue (has a state row) but isn't anymore:
// gets cleared, and obviously isn't in toNotify.
{
  const overdue = [];
  const state = [{ category: 'nap', last_notified_at: hoursAgo(1) }];
  const { toNotify, toClear } = decideOverdueNotifications(overdue, state, now);
  assert.equal(toNotify.length, 0);
  assert.deepEqual(toClear, ['nap']);
}

// Two categories overdue at once, one fresh and one still within its
// reminder window: only the fresh one notifies.
{
  const overdue = [
    { key: 'feed', label: 'Feed', detail: 'Late by 10 minutes' },
    { key: 'diaper', label: 'Diaper', detail: 'Late by 45 minutes' },
  ];
  const state = [{ category: 'diaper', last_notified_at: hoursAgo(1) }];
  const { toNotify, toClear } = decideOverdueNotifications(overdue, state, now);
  assert.deepEqual(toNotify.map(i => i.key).sort(), ['feed']);
  assert.equal(toClear.length, 0);
}

console.log('All notifications tests passed.');
