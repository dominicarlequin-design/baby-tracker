// Solids log helpers (migration 0007): a solid-food entry is a baby_events
// row with type 'solid', a food_name and an optional food_reaction. Pure
// functions, no imports from React or Supabase, so node can test them.
import { localDateStr } from './logic.js';

export const FOOD_MAX = 60;
// Common guidance: introduce one new food at a time and wait a few days
// before the next, so a reaction can be traced to its cause.
export const WATCH_DAYS = 3;

export const REACTIONS = {
  none: 'No reaction',
  mild: 'Mild (rash, gas, fussy)',
  strong: 'Strong (hives, vomiting, swelling)',
};
const REACTION_RANK = { none: 0, mild: 1, strong: 2 };

export const STARTER_FOODS = ['Pumpkin', 'Banana', 'Avocado', 'Sweet potato', 'Oatmeal', 'Pear', 'Peas', 'Apple'];

// The most common food allergens. Matched on whole words.
const ALLERGEN_TERMS = ['peanut', 'egg', 'milk', 'yogurt', 'cheese', 'soy', 'wheat', 'fish', 'salmon', 'shrimp', 'shellfish', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'tree nut', 'sesame'];

export const normalizeFood = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const foodKey = (s) => normalizeFood(s).toLowerCase();

export function isCommonAllergen(name) {
  const key = foodKey(name);
  return ALLERGEN_TERMS.some(t => new RegExp(`(^|[^a-z])${t}(s|es)?([^a-z]|$)`).test(key));
}

const dayNumber = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const addDaysStr = (dateStr, n) => new Date((dayNumber(dateStr) + n) * 86400000).toISOString().slice(0, 10);

// Every food tried (first time seen, times eaten, worst reaction) plus the
// "new food watch": the newest food's day count while it is within the
// WATCH_DAYS window. `events` can hold any event types.
export function summarizeFoods(events, timezone, now) {
  const rows = (events || [])
    .filter(e => e && e.type === 'solid' && normalizeFood(e.food_name))
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  const byKey = new Map();
  for (const e of rows) {
    const key = foodKey(e.food_name);
    const reaction = REACTION_RANK[e.food_reaction] != null ? e.food_reaction : null;
    const hit = byKey.get(key);
    if (!hit) {
      byKey.set(key, {
        key, name: normalizeFood(e.food_name), firstAt: e.event_time, lastAt: e.event_time,
        count: 1, reaction, allergen: isCommonAllergen(e.food_name),
      });
    } else {
      hit.count += 1;
      hit.lastAt = e.event_time;
      if (reaction && (hit.reaction == null || REACTION_RANK[reaction] > REACTION_RANK[hit.reaction])) hit.reaction = reaction;
    }
  }
  const foods = [...byKey.values()].sort((a, b) => new Date(b.firstAt) - new Date(a.firstAt));

  let watching = null;
  const newest = foods[0];
  if (newest) {
    const firstDay = localDateStr(new Date(newest.firstAt), timezone);
    const today = localDateStr(now, timezone);
    const day = dayNumber(today) - dayNumber(firstDay) + 1;
    if (day >= 1 && day <= WATCH_DAYS) {
      watching = { food: newest, day, of: WATCH_DAYS, okFrom: addDaysStr(firstDay, WATCH_DAYS) };
    }
  }
  return { foods, watching, total: foods.length };
}
