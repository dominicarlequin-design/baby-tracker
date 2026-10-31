// Logging without signal. When a Today tap can't reach the server (no
// signal, airplane mode, a dead spot in the building), the row is kept on
// this phone and sent once the connection is back. Each row keeps the time
// of the original tap, so a feed logged at 2:04am is saved as 2:04am even if
// it only reaches the server at 2:30.
//
// The queue lives in localStorage (per phone). Sending is idempotent: before
// inserting, it checks for a row with the same type and exact event_time,
// so a request that did reach the server but lost its reply is not saved
// twice.

export const QUEUE_KEY = 'pending-logs-v1';
export const QUEUE_CHANGED = 'pending-logs-changed';

const defaultStorage = () => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; }
};

// iOS Safari says "Load failed", Chrome "Failed to fetch", Firefox
// "NetworkError when attempting to fetch resource".
export function isNetworkError(error, online = typeof navigator === 'undefined' || navigator.onLine !== false) {
  if (!online) return true;
  const msg = String(error?.message || error || '');
  return /load failed|failed to fetch|networkerror|network request failed|fetch failed/i.test(msg);
}

export function readQueue(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const list = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeQueue(list, storage = defaultStorage()) {
  if (!storage) return;
  try { storage.setItem(QUEUE_KEY, JSON.stringify(list)); } catch (e) {}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_CHANGED));
}

export function enqueue(row, storage = defaultStorage()) {
  const qid = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeQueue([...readQueue(storage), { qid, row }], storage);
  return qid;
}

export function dequeue(qid, storage = defaultStorage()) {
  writeQueue(readQueue(storage).filter(x => x.qid !== qid), storage);
}

// Queued rows shaped like baby_events rows, so screens can show them.
export function pendingAsEvents(storage = defaultStorage()) {
  return readQueue(storage).map(({ qid, row }) => ({ id: `temp-${qid}`, pending: true, ...row }));
}

// Sends everything it can. `db` is the Supabase client. Stops at the first
// network failure (still offline) and keeps the rest; drops rows the server
// rejects outright so one bad row can't block the queue forever.
export async function flushQueue(db, storage = defaultStorage()) {
  let sent = 0;
  let dropped = 0;
  for (const item of readQueue(storage)) {
    const { row } = item;
    const { data: existing, error: lookErr } = await db.from('baby_events').select('id')
      .eq('type', row.type).eq('event_time', row.event_time).limit(1);
    if (lookErr) {
      if (isNetworkError(lookErr)) break;
    } else if (existing && existing.length) {
      dequeue(item.qid, storage);
      sent++;
      continue;
    }
    const { error } = await db.from('baby_events').insert(row);
    if (error) {
      if (isNetworkError(error)) break;
      console.error('Dropped a queued log the server rejected:', error);
      dequeue(item.qid, storage);
      dropped++;
      continue;
    }
    dequeue(item.qid, storage);
    sent++;
  }
  return { sent, dropped, left: readQueue(storage).length };
}
