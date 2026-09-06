// Shared formatting helpers, status-copy builders, and small presentational
// components used by the Log (/), Upcoming (/upcoming), and Recent
// (/recent) pages — split out here (rather than duplicated three times)
// once Upcoming and Recent activity became their own routes instead of two
// collapsible cards on the Log screen. Nothing in this file holds state or
// touches the network; it's pure formatting/JSX, so it doesn't need a
// 'use client' directive of its own — it just gets bundled into whichever
// client page imports it.
import { localDateStr, localDateTimeToUtc } from './logic';
import { formatMinutesAsClock } from './summaries';

export const TYPE_LABELS = {
  feed: 'Fed',
  nap_start: 'Nap started',
  nap_end: 'Nap ended',
  diaper: 'Diaper',
  medicine: 'Medicine',
  sleep_start: 'Bedtime',
  sleep_end: 'Wake up',
};

export const DIAPER_DETAIL_LABELS = { pee: 'Pee', poop: 'Poop', both: 'Both' };

// Extra "· 4 oz" / "· Poop" suffix for a Recent Activity row, when the
// underlying event has feed_ounces / diaper_detail recorded.
export function activityDetailSuffix(raw) {
  if (raw.type === 'feed' && raw.feed_ounces != null) return ` · ${raw.feed_ounces} oz`;
  if (raw.type === 'diaper' && raw.diaper_detail) return ` · ${DIAPER_DETAIL_LABELS[raw.diaper_detail] || raw.diaper_detail}`;
  return '';
}

export function formatLocalTime(iso, timezone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function formatHours(h) {
  if (h == null) return null;
  if (h < 1) return `${Math.max(0, Math.round(h * 60))}m`;
  return `${h.toFixed(1)}h`;
}

// "1h 30m" / "45 minutes" style duration, for prose (eyebrows, sub-lines).
export function formatDurationWords(hours) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatTimeOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatRelative(iso, now) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatGroupDate(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

// Soonest medicine_times_local slot that's still ahead of `now` (today's
// remaining slots, or tomorrow's first, if all of today's have passed).
export function nextMedicineSlot(config, now) {
  const { medicine_times_local, timezone } = config;
  if (!medicine_times_local?.length) return null;
  const candidates = [];
  for (const dayOffset of [0, 1]) {
    const dayStr = localDateStr(new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000), timezone);
    for (const t of medicine_times_local) {
      const slot = localDateTimeToUtc(dayStr, t, timezone);
      if (slot.getTime() > now.getTime()) candidates.push(slot);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] || null;
}

// Picks whichever of feed/diaper/nap/night-sleep is nearest its due time (or
// furthest past it) as the Log screen's Next-up card subject. A single
// "hours past due" score does double duty: for a not-yet-due category it's
// the most negative (closest to zero = nearest due), for an overdue one
// it's the most positive (furthest past). Categories with no dueAt (nothing
// logged yet, or currently asleep) aren't candidates.
export function pickNextUp(status, now) {
  let best = null;
  let bestScore = -Infinity;
  for (const key of ['feed', 'diaper', 'nap', 'sleep']) {
    const s = status[key];
    if (!s?.dueAt) continue;
    const score = (now.getTime() - new Date(s.dueAt).getTime()) / (1000 * 60 * 60);
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

export function nextUpContent(key, status, config, timezone) {
  const s = status[key];
  const dueClock = s.dueAt ? formatLocalTime(s.dueAt, timezone) : '';
  const lastClock = s.lastEventTime ? formatLocalTime(s.lastEventTime, timezone) : '';
  const overdueMultiplier = config.overdue_multiplier ?? 1.25;

  if (key === 'feed' || key === 'diaper') {
    const noun = key === 'feed' ? 'Feed' : 'Diaper change';
    const pastNoun = key === 'feed' ? 'fed' : 'changed';
    if (s.state === 'overdue') {
      return {
        eyebrow: `Late by ${formatDurationWords(s.hoursSince - s.avgHours)}`,
        headline: `${noun} was due ${dueClock}`,
        sub: `That's ${formatHours(s.hoursSince)} since last ${pastNoun} — past ${overdueMultiplier}× her usual ${formatHours(s.avgHours)} gap.`,
      };
    }
    if (s.state === 'due-soon') {
      return {
        eyebrow: `Due in about ${formatDurationWords(Math.max(0, s.avgHours - s.hoursSince))}`,
        headline: `${noun} around ${dueClock}`,
        sub: `Last ${pastNoun} ${lastClock} · she usually goes ${formatHours(s.avgHours)}`,
      };
    }
    return {
      eyebrow: 'Next up',
      headline: `${noun} around ${dueClock}`,
      sub: `Last ${pastNoun} ${lastClock} · she usually goes ${formatHours(s.avgHours)}`,
    };
  }

  // Nap never reaches the 'overdue' state (see napStatus in lib/logic.js —
  // wake windows swing too much for "late" to mean something was missed),
  // so 'due-soon' alone has to cover both "getting close" and "well past
  // her usual window but that's normal" — split by hoursSince vs. avgHours
  // rather than by state, and kept deliberately non-alarming either way.
  if (key === 'nap') {
    if (s.state === 'due-soon' && s.hoursSince >= s.avgHours) {
      return {
        eyebrow: 'Running long',
        headline: `Still awake past ${dueClock}`,
        sub: `Awake ${formatHours(s.hoursSince)} — longer than her usual ${formatHours(s.avgHours)} wake window. That varies night to night, so it's not necessarily overdue.`,
      };
    }
    if (s.state === 'due-soon') {
      return {
        eyebrow: `Due in about ${formatDurationWords(Math.max(0, s.avgHours - s.hoursSince))}`,
        headline: `Nap around ${dueClock}`,
        sub: `Awake since ${lastClock} · usual wake window ${formatHours(s.avgHours)}`,
      };
    }
    return {
      eyebrow: 'Next up',
      headline: `Nap around ${dueClock}`,
      sub: `Awake since ${lastClock} · usual wake window ${formatHours(s.avgHours)}`,
    };
  }

  // Night sleep is judged against a wall-clock target, not an average gap,
  // so its due-soon/overdue states are both "already past bedtime" — only
  // the grace deadline separates them. There's no "approaching" due-soon
  // phase the way there is for the interval-based categories above.
  const graceMinutes = config.medicine_grace_minutes;
  const minutesPast = Math.round((s.hoursSince ?? 0) * 60);
  if (s.state === 'overdue') {
    // Eyebrow is just the category name here, not the lateness figure —
    // that number lives in `lateBy` instead, rendered once inline with the
    // headline, so it isn't stated twice the way "Late by 17 minutes" /
    // "That's 17m past bedtime" used to.
    return {
      eyebrow: 'Bedtime',
      headline: `Was due ${dueClock}`,
      lateBy: `${formatDurationWords(s.hoursSince)} late`,
      sub: `Past the ${graceMinutes}-minute grace window from Settings.`,
    };
  }
  if (s.state === 'due-soon') {
    return {
      eyebrow: 'Just past bedtime',
      headline: `Bedtime was due ${dueClock}`,
      sub: `${minutesPast}m past · grace ends in ${Math.max(0, graceMinutes - minutesPast)}m.`,
    };
  }
  return {
    eyebrow: 'Next up',
    headline: `Bedtime around ${dueClock}`,
    sub: `Usually around ${formatTimeOfDay(config.target_bedtime_local ?? '19:15')}`,
  };
}

// Plain-language explanation of how a category's due-time estimate was
// reached, for the "Why?" button on each Upcoming row (and the overdue
// banner on Log). Mirrors the actual logic in lib/logic.js's computeStatus
// rather than restating it loosely, so this never drifts from what the app
// is actually doing.
export function explainStatus(key, status, config, timezone) {
  const overdueMultiplier = config.overdue_multiplier ?? 1.25;

  if (key === 'feed' || key === 'diaper') {
    const noun = key === 'feed' ? 'feeds' : 'diaper changes';
    const verb = key === 'feed' ? 'fed' : 'changed';
    if (!status.lastEventTime) {
      return `No ${noun} logged yet, so this starts from an assumed gap of ${formatHours(status.avgHours)} until real history builds up.`;
    }
    const dueSoonAfter = formatHours(status.avgHours * 0.8);
    const overdueAfter = formatHours(status.avgHours * overdueMultiplier);
    return `Based on the average time between your last several ${noun} (currently ${formatHours(status.avgHours)}). Last ${verb} at ${formatLocalTime(status.lastEventTime, timezone)}, so the next one is expected around ${formatLocalTime(status.dueAt, timezone)}. It's flagged "due soon" once ${dueSoonAfter} has passed, and "overdue" past ${overdueAfter} — that's the average gap times the ${overdueMultiplier} overdue multiplier from Settings.`;
  }

  if (key === 'nap') {
    if (status.asleep) {
      return `She's currently napping, tracked since ${formatLocalTime(status.lastEventTime, timezone)}. The next nap estimate starts fresh once she wakes.`;
    }
    if (!status.lastEventTime) {
      return `No naps logged yet, so this starts from an assumed wake window of ${formatHours(status.avgHours)} until real history builds up.`;
    }
    const dueSoonAfter = formatHours(status.avgHours * 0.8);
    return `Based on how long she typically stays awake between naps (currently ${formatHours(status.avgHours)}). Awake since ${formatLocalTime(status.lastEventTime, timezone)}, so the next nap is expected around ${formatLocalTime(status.dueAt, timezone)}. "Due soon" kicks in after ${dueSoonAfter} awake. Unlike Feed and Diaper, Nap never turns "overdue" — wake windows swing too much day to day for a late nap to mean something was missed, so it just keeps reading as due until she naps again.`;
  }

  if (key === 'sleep') {
    if (status.asleep) {
      return `She's asleep for the night, tracked since ${formatLocalTime(status.lastEventTime, timezone)}.`;
    }
    const bedtime = formatTimeOfDay(config.target_bedtime_local ?? '19:15');
    return `Night sleep isn't averaged from history like the others — it's judged against your Target bedtime (${bedtime}, set in Settings). Once that time passes with no Bedtime tap, it's flagged "due soon," then "overdue" ${config.medicine_grace_minutes} minutes after that.`;
  }

  if (key === 'medicine') {
    const times = (config.medicine_times_local || []).map(formatTimeOfDay).join(', ');
    const lastSlot = status.lastScheduledSlot ? formatLocalTime(status.lastScheduledSlot, timezone) : null;
    return `Medicine runs on a fixed daily schedule (${times}, set in Settings) rather than an average.${lastSlot ? ` The most recent scheduled dose was ${lastSlot}.` : ''} It's flagged overdue if nothing is logged within ${config.medicine_grace_minutes} minutes of that time.`;
  }

  return '';
}

// Collapses adjacent nap_start/nap_end pairs (in the newest-first event
// list) into a single row, and groups the rest by local day.
export function buildActivityGroups(events, timezone, now) {
  const sorted = [...events].sort((a, b) => new Date(b.event_time) - new Date(a.event_time));
  const todayStr = localDateStr(now, timezone);
  const yesterdayStr = localDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone);

  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const next = sorted[i + 1];
    if (e.type === 'nap_end' && next?.type === 'nap_start') {
      items.push({ id: e.id, kind: 'nap', start: next.event_time, end: e.event_time, raw: e });
      i++;
      continue;
    }
    items.push({ id: e.id, kind: 'single', type: e.type, event_time: e.event_time, raw: e });
  }

  const groups = [];
  let currentDay = null;
  let currentGroup = null;
  for (const item of items) {
    const ts = item.kind === 'nap' ? item.end : item.event_time;
    const dayStr = localDateStr(new Date(ts), timezone);
    if (dayStr !== currentDay) {
      currentDay = dayStr;
      currentGroup = {
        dayStr,
        label: dayStr === todayStr ? 'Today' : dayStr === yesterdayStr ? 'Yesterday' : formatGroupDate(dayStr),
        items: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }
  return groups;
}

// Night sleep gets its own row (instead of the generic MoreRow) so it can
// carry a second, collapsible "Bedtime pattern" dropdown underneath the
// usual label/detail line — the historical actual-bedtime pattern, shown
// alongside the Target-bedtime-driven due/overdue status, not replacing it.
export function NightSleepRow({ status, timezone, pattern, patternOpen, onTogglePattern, onExplain }) {
  const detail = status.asleep
    ? `Asleep since ${formatLocalTime(status.lastEventTime, timezone)}`
    : status.dueAt
      ? formatLocalTime(status.dueAt, timezone)
      : 'On track';
  const toneClass = status.asleep ? 'muted' : status.state === 'overdue' ? 'overdue' : status.state === 'due-soon' ? 'due-soon' : 'muted';

  return (
    <div className="status-row-block">
      <div className="status-row">
        <div>
          <div className="status-label">
            Night sleep
            <button type="button" className="why-btn" onClick={() => onExplain('sleep')} aria-label="Why Night sleep?">Why?</button>
          </div>
        </div>
        <span className={`more-detail ${toneClass}`}>{detail}</span>
      </div>
      <button type="button" className="pattern-toggle" onClick={onTogglePattern} aria-expanded={patternOpen}>
        <span>Bedtime pattern</span>
        <span className={`chevron ${patternOpen ? 'open' : ''}`}>{'>'}</span>
      </button>
      {patternOpen && pattern && (
        <div className="pattern-dropdown">
          {pattern.sampleCount < 3 ? (
            <div className="pattern-line">
              Not enough bedtime history yet ({pattern.sampleCount} night{pattern.sampleCount === 1 ? '' : 's'} logged) — keep logging and a pattern will show up here.
            </div>
          ) : (
            <>
              <div className="pattern-line">
                Based on her last {pattern.sampleCount} nights, she usually goes down around {formatMinutesAsClock(pattern.meanMinutes)} (±{Math.round(pattern.spreadMinutes)} min).
              </div>
              <div className={`pattern-line ${pattern.overdue ? 'overdue' : ''}`}>
                {pattern.overdue
                  ? "That's past her usual window for tonight, based on pattern alone."
                  : `Tonight's pattern-based window: around ${formatLocalTime(pattern.estimateAt, timezone)}.`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MoreRow({ label, status, timezone, asleepLabel, statusKey, onExplain }) {
  const detail = status.asleep
    ? `${asleepLabel} since ${formatLocalTime(status.lastEventTime, timezone)}`
    : status.dueAt
      ? formatLocalTime(status.dueAt, timezone)
      : 'On track';
  const toneClass = status.asleep ? 'muted' : status.state === 'overdue' ? 'overdue' : status.state === 'due-soon' ? 'due-soon' : 'muted';
  return (
    <div className="status-row">
      <div>
        <div className="status-label">
          {label}
          <button type="button" className="why-btn" onClick={() => onExplain(statusKey)} aria-label={`Why ${label}?`}>Why?</button>
        </div>
      </div>
      <span className={`more-detail ${toneClass}`}>{detail}</span>
    </div>
  );
}
