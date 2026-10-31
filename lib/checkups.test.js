// Plain-assertion checks for lib/checkups.js. Run with: node lib/checkups.test.js
import assert from 'node:assert/strict';
import { addMonthsStr, checkupDueDate, checkupTimeline, nextCheckup, CHECKUPS } from './checkups.js';

assert.equal(addMonthsStr('2026-01-31', 1), '2026-02-28');
assert.equal(addMonthsStr('2026-04-09', 6), '2026-10-09');
assert.equal(addMonthsStr('2026-11-15', 3), '2027-02-15');
assert.equal(checkupDueDate('2026-04-09', CHECKUPS[0]), '2026-04-13');

const birth = '2026-04-09';
// Oct 31: 6-month (Oct 9) is due; 9-month (Jan 9) is upcoming.
let tl = checkupTimeline(birth, [], '2026-10-31');
const by = Object.fromEntries(tl.map(c => [c.key, c]));
assert.equal(by.m6.status, 'due');
assert.equal(by.m9.status, 'upcoming');
assert.equal(by.m4.status, 'missed');
assert.equal(nextCheckup(tl).key, 'm6');

// Marked done.
tl = checkupTimeline(birth, [{ key: 'm6', visit_date: '2026-10-10' }, { key: 'm4', visit_date: '2026-08-10' }], '2026-10-31');
assert.equal(tl.find(c => c.key === 'm6').status, 'done');
assert.equal(tl.find(c => c.key === 'm4').status, 'done');
assert.equal(nextCheckup(tl).key, 'm9');

// Two weeks early counts as due.
tl = checkupTimeline(birth, [{ key: 'm6', visit_date: '2026-10-10' }], '2026-12-27');
assert.equal(tl.find(c => c.key === 'm9').status, 'due');

// No birth date, no timeline.
assert.deepEqual(checkupTimeline(null, [], '2026-10-31'), []);

console.log('checkups tests passed.');
