// Daily milk target, shared by Today (Feedings card, Daily Milk sheet,
// evening banner), Profile (live target preview) and Insights (Milk tab).
//
// The rule: her weight in lbs x 2.5 oz, capped at 32 oz a day. It's a
// guide, not a rule: hunger cues come first, so nothing here ever turns
// red or counts as "overdue". Three calm states only:
//   under   - below 90% of target (pink)
//   ontrack - 90% of target up to the target itself (soft green)
//   over    - above the target (soft amber)

export const OZ_PER_LB = 2.5;
export const DAILY_CAP_OZ = 32;
export const ON_TRACK_RATIO = 0.9;
export const EVENING_NUDGE_RATIO = 0.7;
export const EVENING_START_HOUR = 17; // 5 PM local

// Returns { target, raw, capped }, or null when no usable weight is set.
export function dailyMilkTarget(weightLbs) {
  if (weightLbs == null || weightLbs === '') return null;
  const w = Number(weightLbs);
  if (!Number.isFinite(w) || w <= 0) return null;
  const raw = Math.round(w * OZ_PER_LB * 10) / 10;
  return { target: Math.min(raw, DAILY_CAP_OZ), raw, capped: raw > DAILY_CAP_OZ };
}

export function milkStatus(oz, target) {
  if (!target) return null;
  if (oz > target) return 'over';
  if (oz >= target * ON_TRACK_RATIO) return 'ontrack';
  return 'under';
}

export function milkStatusText(status, capped) {
  if (status === 'over') return capped ? 'over the cap' : 'over target';
  if (status === 'ontrack') return 'on track';
  if (status === 'under') return 'under target';
  return '';
}

// Her usual feeds per day, from full past days that have any feeds logged.
export function usualFeedsPerDay(pastDays) {
  const counts = pastDays.map(d => d.feeds).filter(n => n > 0);
  if (!counts.length) return null;
  return Math.round(counts.reduce((sum, n) => sum + n, 0) / counts.length);
}

// "Next bottle: about N oz" = ounces left / her usual number of feeds left.
// Always assumes at least one more feed, so it never divides by zero.
export function nextBottle(oz, target, feedsToday, usualFeeds) {
  if (!target) return null;
  const left = Math.max(target - oz, 0);
  const feedsLeft = Math.max((usualFeeds ?? 0) - feedsToday, 1);
  return { left, feedsLeft, ounces: left > 0 ? Math.round(left / feedsLeft) : 0 };
}

// Evening-only gentle nudge: after 5 PM and still under 70% of target.
export function showEveningNudge(oz, target, localHour) {
  if (!target) return false;
  return localHour >= EVENING_START_HOUR && oz < target * EVENING_NUDGE_RATIO;
}
