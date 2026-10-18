// Fails if the alert server's copy of the logic has drifted from the app's.
// Fix: npm run sync:edge, then redeploy the function.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./logic.js', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/check-overdue/logic.js', import.meta.url), 'utf8');
assert.equal(edge, app, 'supabase/functions/check-overdue/logic.js differs from lib/logic.js. Run: npm run sync:edge (then redeploy the function).');
console.log('Edge logic in sync.');
