// Plain-assertion checks for lib/solids.js. Run with: node lib/solids.test.js
import assert from 'node:assert/strict';
import { summarizeFoods, isCommonAllergen, foodKey, normalizeFood } from './solids.js';

const TZ = 'America/New_York';
const ev = (food, iso, reaction) => ({ type: 'solid', food_name: food, event_time: iso, food_reaction: reaction ?? null });

assert.equal(normalizeFood('  Sweet   potato '), 'Sweet potato');
assert.equal(foodKey('  Sweet   Potato '), 'sweet potato');

// Allergens match whole words only.
assert.equal(isCommonAllergen('Peanut butter'), true);
assert.equal(isCommonAllergen('Scrambled eggs'), true);
assert.equal(isCommonAllergen('Eggplant'), false);
assert.equal(isCommonAllergen('Pumpkin'), false);

// No foods yet.
let s = summarizeFoods([], TZ, new Date('2026-10-30T16:00:00Z'));
assert.equal(s.total, 0);
assert.equal(s.watching, null);

// Day 1 = the day the food was first eaten (local time); repeats don't reset it.
const events = [
  ev('Pumpkin', '2026-10-29T15:00:00Z', 'none'),
  ev('pumpkin', '2026-10-30T14:00:00Z'),
  { type: 'feed', event_time: '2026-10-30T15:00:00Z' },
];
s = summarizeFoods(events, TZ, new Date('2026-10-30T16:00:00Z'));
assert.equal(s.total, 1);
assert.equal(s.foods[0].count, 2);
assert.equal(s.watching.day, 2);
assert.equal(s.watching.okFrom, '2026-11-01');

// After the window closes there is nothing to watch.
s = summarizeFoods(events, TZ, new Date('2026-11-02T16:00:00Z'));
assert.equal(s.watching, null);

// Newest food is the one being watched; worst reaction wins.
s = summarizeFoods([
  ev('Pumpkin', '2026-10-25T15:00:00Z', 'none'),
  ev('Banana', '2026-10-30T15:00:00Z', 'mild'),
  ev('Banana', '2026-10-30T20:00:00Z', 'none'),
], TZ, new Date('2026-10-30T22:00:00Z'));
assert.equal(s.foods[0].name, 'Banana');
assert.equal(s.foods[0].reaction, 'mild');
assert.equal(s.watching.food.name, 'Banana');
assert.equal(s.watching.day, 1);

// Late-night log counts on the local day, not the UTC day.
s = summarizeFoods([ev('Pear', '2026-10-31T02:30:00Z')], TZ, new Date('2026-10-31T14:00:00Z'));
assert.equal(s.watching.day, 2);

console.log('solids tests passed.');
