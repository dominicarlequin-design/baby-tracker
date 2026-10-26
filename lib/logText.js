// Who logged what, in plain words. Shared by the app (the live banner and
// the double-log check) and the notify-log alert server, which keeps an
// exact copy (npm run sync:edge copies it into
// supabase/functions/notify-log/logText.js). No imports, so it runs in both.

// Window event fired whenever baby_events changes (a log, an undo, the other
// parent's log arriving live). Today and History refresh on it.
export const EVENTS_CHANGED = 'baby-events-changed';

// The two family accounts (same emails as public.is_family() in Supabase).
export const PARENT_NAMES = {
  'dominic.arlequin@gmail.com': 'Dom',
  'ventysamar@gmail.com': 'Ysa',
};

export function parentName(email) {
  if (!email) return null;
  return PARENT_NAMES[String(email).trim().toLowerCase()] || null;
}

// "Ysa" for the other parent, "You" for the person looking, "Someone" for
// older rows logged before the app recorded who made them.
export function whoLogged(loggedBy, viewerEmail) {
  if (loggedBy && viewerEmail && loggedBy.toLowerCase() === viewerEmail.toLowerCase()) return 'You';
  return parentName(loggedBy) || 'Someone';
}

const DIAPER_WORDS = { pee: 'wet', poop: 'dirty', both: 'wet + dirty' };

// What happened, as the end of a sentence that starts with a name:
// "Ysa" + " logged a feed". `detail` is the short extra line ("4 oz").
export function describeLog(event) {
  const type = event?.type;
  let action;
  let detail = null;
  switch (type) {
    case 'feed':
      action = 'logged a feed';
      if (typeof event.feed_ounces === 'number') detail = `${event.feed_ounces} oz`;
      break;
    case 'diaper':
      action = 'logged a diaper';
      if (DIAPER_WORDS[event.diaper_detail]) detail = DIAPER_WORDS[event.diaper_detail];
      break;
    case 'nap_start': action = 'started a nap'; break;
    case 'nap_end': action = 'ended the nap'; break;
    case 'sleep_start': action = 'logged bedtime'; break;
    case 'sleep_end': action = 'logged wake up'; break;
    case 'medicine': action = 'gave medicine'; break;
    case 'custom':
      action = `logged ${event.custom_label || 'something'}`;
      break;
    default:
      action = 'logged something';
  }
  if (event?.note && type === 'custom') detail = detail ? `${detail} · ${event.note}` : event.note;
  return { action, detail };
}

// How long after one log the same thing logged again probably means it was
// done twice (two parents, one bottle). Custom logs match on their label.
export const DOUBLE_LOG_MINUTES = {
  feed: 15,
  diaper: 10,
  medicine: 30,
  nap_start: 10,
  nap_end: 10,
  sleep_start: 10,
  sleep_end: 10,
  custom: 10,
};

const sameKind = (a, b) => a.type === b.type
  && (a.type !== 'custom' || String(a.custom_label || '').trim().toLowerCase() === String(b.custom_label || '').trim().toLowerCase());

// The most recent event in `events` that looks like the same log as
// `candidate` (same type, same custom label) within its double-log window
// of `atMs`. Null when there isn't one.
export function findDoubleLog(events, candidate, atMs) {
  const windowMin = DOUBLE_LOG_MINUTES[candidate.type];
  if (!windowMin) return null;
  let best = null;
  for (const e of events || []) {
    if (!e || e.id === candidate.id || String(e.id || '').startsWith('temp-')) continue;
    if (!sameKind(e, candidate)) continue;
    const ms = new Date(e.event_time).getTime();
    const gapMin = Math.abs(atMs - ms) / 60000;
    if (gapMin > windowMin) continue;
    if (!best || ms > new Date(best.event_time).getTime()) best = e;
  }
  return best;
}
