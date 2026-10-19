// Plain-assertion checks for lib/recipes.js. Run with: node lib/recipes.test.js
import assert from 'node:assert/strict';
import { RECIPES, STAGES, TAGS, stageIndexForAge, recipesForStage, recipeById } from './recipes.js';

// Stage picked from her age.
assert.equal(stageIndexForAge(null), 0);
assert.equal(stageIndexForAge(5.5), 0);
assert.equal(stageIndexForAge(6.2), 0);
assert.equal(stageIndexForAge(7), 1);
assert.equal(stageIndexForAge(8.9), 1);
assert.equal(stageIndexForAge(9), 2);
assert.equal(stageIndexForAge(14), 2);

// Every recipe is complete and well-formed.
const ids = new Set();
for (const r of RECIPES) {
  assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
  ids.add(r.id);
  assert.ok(STAGES[r.stage], `${r.id}: bad stage`);
  assert.ok(r.ingredients.length >= 1, `${r.id}: no ingredients`);
  assert.ok(r.steps.length >= 3, `${r.id}: too few steps`);
  for (const [head, body] of r.steps) assert.ok(head && body, `${r.id}: empty step`);
  assert.ok(r.storage.length >= 1, `${r.id}: no storage`);
  for (const t of r.tags) assert.ok(TAGS[t], `${r.id}: unknown tag ${t}`);
  // Allergen tags always come with allergen guidance.
  if (r.tags.some(t => t.startsWith('allergen-'))) assert.ok(r.allergen, `${r.id}: allergen tag without notes`);
  // Safety: nothing a baby under 12 months shouldn't have.
  const text = JSON.stringify(r).toLowerCase();
  assert.ok(!/\bhoney\b/.test(text), `${r.id}: mentions honey`);
  assert.ok(!/\bsalt\b(?! or sugar)/.test(r.ingredients.join(' ').toLowerCase()), `${r.id}: salt in ingredients`);
}

// Each stage has recipes and lookups work.
for (let i = 0; i < STAGES.length; i++) assert.ok(recipesForStage(i).length >= 3, `stage ${i} needs 3+ recipes`);
assert.equal(recipeById('peanut-oatmeal').title, 'Peanut oatmeal');
assert.equal(recipeById('nope'), null);

console.log('recipes tests passed');
