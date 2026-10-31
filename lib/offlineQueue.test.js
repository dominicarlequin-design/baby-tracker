// Plain-assertion checks for lib/offlineQueue.js. Run with: node lib/offlineQueue.test.js
import assert from 'node:assert/strict';
import { isNetworkError, enqueue, readQueue, dequeue, flushQueue, pendingAsEvents } from './offlineQueue.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

assert.equal(isNetworkError({ message: 'Load failed' }, true), true);
assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }, true), true);
assert.equal(isNetworkError({ message: 'new row violates check constraint' }, true), false);
assert.equal(isNetworkError({ message: 'anything' }, false), true);

// Queue basics.
const s = mem();
const a = enqueue({ type: 'feed', event_time: '2026-10-31T06:04:00.000Z', feed_ounces: 4 }, s);
enqueue({ type: 'diaper', event_time: '2026-10-31T06:10:00.000Z', diaper_detail: 'pee' }, s);
assert.equal(readQueue(s).length, 2);
assert.equal(pendingAsEvents(s)[0].pending, true);
assert.equal(pendingAsEvents(s)[0].feed_ounces, 4);
dequeue(a, s);
assert.equal(readQueue(s).length, 1);

// Fake Supabase client: `rows` is the server table; `offline` fails every call.
function fakeDb(rows, opts = {}) {
  return {
    from: () => {
      const q = { filters: {} };
      const api = {
        select: () => api,
        eq: (k, v) => { q.filters[k] = v; return api; },
        limit: async () => opts.offline ? { error: { message: 'Load failed' } }
          : { data: rows.filter(r => Object.entries(q.filters).every(([k, v]) => r[k] === v)), error: null },
        insert: async (row) => {
          if (opts.offline) return { error: { message: 'Load failed' } };
          if (opts.reject && row.type === opts.reject) return { error: { message: 'violates check constraint' } };
          rows.push(row); return { error: null };
        },
      };
      return api;
    },
  };
}

// Offline: nothing sent, nothing lost.
let r = await flushQueue(fakeDb([], { offline: true }), s);
assert.deepEqual(r, { sent: 0, dropped: 0, left: 1 });

// Online: sent.
const server = [];
r = await flushQueue(fakeDb(server), s);
assert.deepEqual(r, { sent: 1, dropped: 0, left: 0 });
assert.equal(server.length, 1);

// Already on the server (reply was lost): not inserted twice.
const s2 = mem();
enqueue({ type: 'feed', event_time: '2026-10-31T07:00:00.000Z' }, s2);
const server2 = [{ type: 'feed', event_time: '2026-10-31T07:00:00.000Z' }];
r = await flushQueue(fakeDb(server2), s2);
assert.equal(server2.length, 1);
assert.equal(r.left, 0);

// A rejected row is dropped so it can't block the rest.
const s3 = mem();
enqueue({ type: 'bogus', event_time: '2026-10-31T08:00:00.000Z' }, s3);
enqueue({ type: 'feed', event_time: '2026-10-31T08:05:00.000Z' }, s3);
const server3 = [];
r = await flushQueue(fakeDb(server3, { reject: 'bogus' }), s3);
assert.deepEqual(r, { sent: 1, dropped: 1, left: 0 });

console.log('offlineQueue tests passed.');
