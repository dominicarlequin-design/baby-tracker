// Plain-assertion checks for lib/milk.js. Run with: node lib/milk.test.js
import assert from 'node:assert/strict';
import {
  dailyMilkTarget, milkStatus, milkStatusText, usualFeedsPerDay, nextBottle, showEveningNudge,
} from './milk.js';

// Target: weight x 2.5, capped at 32.
assert.deepEqual(dailyMilkTarget(15), { target: 32, raw: 37.5, capped: true });
assert.deepEqual(dailyMilkTarget(10), { target: 25, raw: 25, capped: false });
assert.deepEqual(dailyMilkTarget('12.8'), { target: 32, raw: 32, capped: false });
assert.equal(dailyMilkTarget(null), null);
assert.equal(dailyMilkTarget(''), null);
assert.equal(dailyMilkTarget(0), null);
assert.equal(dailyMilkTarget('abc'), null);

// Status bands: under 90% pink, 90%..100% green, above amber.
assert.equal(milkStatus(26, 32), 'under');
assert.equal(milkStatus(28.7, 32), 'under');
assert.equal(milkStatus(29, 32), 'ontrack');
assert.equal(milkStatus(31, 32), 'ontrack');
assert.equal(milkStatus(32, 32), 'ontrack');
assert.equal(milkStatus(36, 32), 'over');
assert.equal(milkStatus(10, null), null);
assert.equal(milkStatusText('over', true), 'over the cap');
assert.equal(milkStatusText('over', false), 'over target');

// Usual feeds ignores empty days.
assert.equal(usualFeedsPerDay([{ feeds: 6 }, { feeds: 0 }, { feeds: 7 }, { feeds: 5 }]), 6);
assert.equal(usualFeedsPerDay([{ feeds: 0 }]), null);

// Next bottle: 16 oz left over 3 more usual feeds -> about 5 oz.
assert.deepEqual(nextBottle(16, 32, 3, 6), { left: 16, feedsLeft: 3, ounces: 5 });
// Past her usual count still assumes one more feed.
assert.deepEqual(nextBottle(28, 32, 7, 6), { left: 4, feedsLeft: 1, ounces: 4 });
// Target reached.
assert.deepEqual(nextBottle(33, 32, 6, 6), { left: 0, feedsLeft: 1, ounces: 0 });
// No history yet.
assert.deepEqual(nextBottle(10, 32, 2, null), { left: 22, feedsLeft: 1, ounces: 22 });

// Evening nudge: after 5 PM and under 70% (22.4 oz of 32).
assert.equal(showEveningNudge(15, 32, 19), true);
assert.equal(showEveningNudge(22.4, 32, 19), false);
assert.equal(showEveningNudge(15, 32, 14), false);
assert.equal(showEveningNudge(15, null, 20), false);

console.log('milk tests passed');
