// Pure decision logic for app/api/check-overdue, pulled out of the route so
// it can be unit tested without a real Supabase connection or a live push
// service (see notifications.test.js).

// How long a category can sit overdue with no new push before it gets
// reminded again — otherwise "notify once per episode" would mean a single
// push for a night-sleep-overdue situation that then goes silent for the
// rest of the night.
export const REMINDER_HOURS = 3;

// Given the categories currently overdue, the notification_state rows
// already in the DB, and the current time, returns:
//   - toNotify: overdue items that should get a push right now (a brand-new
//     episode, or one that's been overdue >= reminderHours since its last push)
//   - toClear: state rows for categories that are no longer overdue, so the
//     *next* time they go overdue it's treated as a fresh episode rather
//     than immediately eligible for a "reminder" push.
export function decideOverdueNotifications(overdueItems, stateRows, now, reminderHours = REMINDER_HOURS) {
  const overdueKeys = new Set(overdueItems.map(item => item.key));
  const stateByCategory = new Map((stateRows || []).map(row => [row.category, row]));

  const toClear = (stateRows || [])
    .filter(row => !overdueKeys.has(row.category))
    .map(row => row.category);

  const toNotify = overdueItems.filter(item => {
    const state = stateByCategory.get(item.key);
    if (!state) return true;
    const hoursSinceNotified = (now.getTime() - new Date(state.last_notified_at).getTime()) / (1000 * 60 * 60);
    return hoursSinceNotified >= reminderHours;
  });

  return { toNotify, toClear };
}
