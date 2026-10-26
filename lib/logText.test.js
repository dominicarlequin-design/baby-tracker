import assert from 'node:assert/strict';
import { parentName, whoLogged, describeLog, findDoubleLog } from './logText.js';

assert.equal(parentName('Dominic.Arlequin@gmail.com'), 'Dom', 'email match ignores case');
assert.equal(parentName('ventysamar@gmail.com'), 'Ysa');
assert.equal(parentName(null), null);

assert.equal(whoLogged('ventysamar@gmail.com', 'dominic.arlequin@gmail.com'), 'Ysa');
assert.equal(whoLogged('dominic.arlequin@gmail.com', 'Dominic.Arlequin@gmail.com'), 'You');
assert.equal(whoLogged(null, 'dominic.arlequin@gmail.com'), 'Someone', 'old rows have no logger');

assert.deepEqual(describeLog({ type: 'feed', feed_ounces: 4 }), { action: 'logged a feed', detail: '4 oz' });
assert.deepEqual(describeLog({ type: 'feed' }), { action: 'logged a feed', detail: null });
assert.deepEqual(describeLog({ type: 'diaper', diaper_detail: 'both' }), { action: 'logged a diaper', detail: 'wet + dirty' });
assert.equal(describeLog({ type: 'nap_start' }).action, 'started a nap');
assert.equal(describeLog({ type: 'medicine' }).action, 'gave medicine');
assert.deepEqual(describeLog({ type: 'custom', custom_label: 'Bath', note: 'lavender soap' }), { action: 'logged Bath', detail: 'lavender soap' });

const at = Date.parse('2026-10-26T19:00:00Z');
const events = [
  { id: 1, type: 'feed', event_time: '2026-10-26T18:50:00Z' },   // 10 min before
  { id: 2, type: 'feed', event_time: '2026-10-26T18:20:00Z' },   // 40 min before
  { id: 3, type: 'diaper', event_time: '2026-10-26T18:45:00Z' }, // 15 min before
  { id: 4, type: 'custom', custom_label: 'Bath', event_time: '2026-10-26T18:55:00Z' },
  { id: 'temp-x', type: 'medicine', event_time: '2026-10-26T18:59:00Z' },
];
assert.equal(findDoubleLog(events, { type: 'feed' }, at)?.id, 1, 'feed 10 min ago is inside the 15 min window');
assert.equal(findDoubleLog(events, { type: 'diaper' }, at), null, 'diaper 15 min ago is outside the 10 min window');
assert.equal(findDoubleLog(events, { type: 'custom', custom_label: ' bath ' }, at)?.id, 4, 'custom matches label, any case');
assert.equal(findDoubleLog(events, { type: 'custom', custom_label: 'Vitamin D' }, at), null, 'different custom label');
assert.equal(findDoubleLog(events, { type: 'medicine' }, at), null, 'unsaved optimistic rows are ignored');
assert.equal(findDoubleLog(events, { id: 1, type: 'feed' }, Date.parse('2026-10-26T18:50:00Z')), null, 'a log never matches itself');
// A partner's log a few minutes AFTER mine also counts (the both-tapped race).
assert.equal(findDoubleLog(events, { type: 'feed' }, Date.parse('2026-10-26T18:45:00Z'))?.id, 1);

console.log('logText tests passed.');
