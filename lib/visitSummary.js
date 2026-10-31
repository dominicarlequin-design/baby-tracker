// Numbers for the one-page doctor-visit summary (Insights > Visit summary).
// Pure functions (no React, no Supabase) so node can test them.
import { dailySummaries, bedtimeMinutesLocal, formatMinutesAsClock } from './summaries.js';
import { localDateStr } from './logic.js';
import { summarizeFoods } from './solids.js';

export const VISIT_RANGES = [7, 14, 30];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const range = (xs) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null);
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// `events` should cover at least `days` + 1 days. Today is left out (it is
// still in progress) and so are days with nothing logged at all, so a day
// the app wasn't used doesn't drag the averages down.
export function buildVisitSummary(events, config, days, now = new Date()) {
  const timezone = config.timezone || 'America/New_York';
  const all = dailySummaries(events, config, days + 1).slice(0, -1);
  const todayKey = localDateStr(now, timezone);
  const byDay = new Map();
  for (const e of events) {
    const key = localDateStr(new Date(e.event_time), timezone);
    const d = byDay.get(key) || { wet: 0, dirty: 0, medicine: 0 };
    if (e.type === 'diaper') {
      if (e.diaper_detail === 'pee' || e.diaper_detail === 'both') d.wet++;
      if (e.diaper_detail === 'poop' || e.diaper_detail === 'both') d.dirty++;
    } else if (e.type === 'medicine') d.medicine++;
    byDay.set(key, d);
  }

  const logged = all.filter(d => d.feeds + d.diapers + d.naps + d.nightSleepMinutes > 0 && d.date !== todayKey);
  const col = (fn) => logged.map(fn);
  const withOz = logged.filter(d => d.feedOunces > 0);
  const bedtimes = logged.filter(d => d.bedtime).map(d => bedtimeMinutesLocal(d.bedtime, timezone));
  const bedMean = avg(bedtimes);
  const stretches = logged.filter(d => d.longestNightStretchMinutes > 0).map(d => d.longestNightStretchMinutes / 60);
  const wakes = logged.filter(d => d.avgWakeWindowHours != null).map(d => d.avgWakeWindowHours);

  const medicineDays = logged.map(d => (byDay.get(d.date) || {}).medicine || 0);
  const wetDays = logged.map(d => (byDay.get(d.date) || {}).wet || 0);
  const dirtyDays = logged.map(d => (byDay.get(d.date) || {}).dirty || 0);

  const firstDay = all.length ? all[0].date : null;
  const lastDay = all.length ? all[all.length - 1].date : null;

  const solids = summarizeFoods(events, timezone, now);
  const newInRange = solids.foods.filter(f => firstDay && localDateStr(new Date(f.firstAt), timezone) >= firstDay);

  return {
    days, firstDay, lastDay, daysLogged: logged.length,
    rows: logged,
    feeds: { avg: round1(avg(col(d => d.feeds))), ...range(col(d => d.feeds)) },
    ounces: { avg: round1(avg(withOz.map(d => d.feedOunces))), days: withOz.length },
    diapers: { avg: round1(avg(col(d => d.diapers))), wet: round1(avg(wetDays)), dirty: round1(avg(dirtyDays)) },
    sleep: { avgHours: round1(avg(col(d => d.totalSleepMinutes / 60))), napsPerDay: round1(avg(col(d => d.naps))) },
    night: { longestAvgHours: round1(avg(stretches)), longestMaxHours: stretches.length ? round1(Math.max(...stretches)) : null },
    wakeWindowHours: round1(avg(wakes)),
    bedtime: bedMean == null ? null : formatMinutesAsClock(Math.round(bedMean)),
    medicine: { total: medicineDays.reduce((a, b) => a + b, 0), perDay: round1(avg(medicineDays)) },
    solids: { total: solids.total, newInRange, watching: solids.watching },
  };
}
