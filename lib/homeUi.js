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

// Line-icon paths for the Log buttons, each rendered on a small tinted
// disc (colored via CSS on the parent button class, see .icon-disc in
// globals.css) rather than a flat glyph — chosen over emoji so they can be
// tinted to match each button's own palette and render identically
// everywhere instead of varying by OS. Lives here (not in app/page.js)
// so the Today page and the global quick-log popup (lib/QuickLogSheet.js)
// both render from this one copy — two copies of the same glyph paths
// would drift the moment either one got tweaked without the other.
// Sticker-style icon set, replacing the old thin-line-art + duotone-fill
// glyphs above (kept in git history if we ever want to revert). Each icon
// is drawn as flat color blocks with a white "die-cut" border — every
// path is rendered twice, once thick in white beneath (the halo/border)
// and once on top in its real flat color with a thin unified outline for
// definition between blocks — plus one small glossy highlight ellipse per
// icon, so it reads as a sticker sitting on the button rather than a line
// drawing. Colors are baked into each path (not currentColor) since the
// whole point of a sticker is that it looks the same regardless of what's
// behind it; picked to match each button's own category color
// (.btn-feed/.btn-diaper/etc. in this file's CSS) so nothing clashes.
// Approved by Dom after a multi-round icon exploration (bottle icon → full
// six-icon pass → outline/highlight/shadow/dark-mode/pressed-state tweaks).
const HALO = 3;
const HALO_SMALL = 2.2;
const OUTLINE = 1;
const OUTLINE_SMALL = 0.9;
// Sun rays (Wake) reuse the exact ray geometry from the old line icon.
const RAY_D = 'M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6';

export const ICON_PATHS = {
  feed: (
    <>
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M10.5 2v3.2c0 .5-.2 1-.6 1.4l-1 1c-.6.6-.9 1.4-.9 2.2v1.7h5.9V9.8c0-.8-.3-1.6-.9-2.2l-1-1c-.4-.4-.6-.9-.6-1.4V2Z" />
      <path fill="#d6207a" stroke="#a3164f" strokeWidth={OUTLINE} strokeLinejoin="round" d="M10.5 2v3.2c0 .5-.2 1-.6 1.4l-1 1c-.6.6-.9 1.4-.9 2.2v1.7h5.9V9.8c0-.8-.3-1.6-.9-2.2l-1-1c-.4-.4-.6-.9-.6-1.4V2Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M8 11.5h7.8V19a2 2 0 0 1-2 2h-3.8a2 2 0 0 1-2-2Z" />
      <path fill="#fcd9e3" stroke="#a3164f" strokeWidth={OUTLINE} strokeLinejoin="round" d="M8 11.5h7.8V19a2 2 0 0 1-2 2h-3.8a2 2 0 0 1-2-2Z" />
      <path fill="#fff" stroke="none" opacity="0.85" d="M8.6 15h6.6v1.4H8.6Z" />
      <ellipse fill="#fff" opacity="0.55" cx="9.7" cy="13.2" rx="0.8" ry="1.2" />
    </>
  ),
  diaper: (
    <>
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M7 6.5c-.4 5.8 2.1 9.5 5 11 2.9-1.5 5.4-5.2 5-11Z" />
      <path fill="#c48fd4" stroke="#6d2f8c" strokeWidth={OUTLINE} strokeLinejoin="round" d="M7 6.5c-.4 5.8 2.1 9.5 5 11 2.9-1.5 5.4-5.2 5-11Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO_SMALL} strokeLinejoin="round" d="M4.5 6.9c-.9-.2-1.7.2-1.7 1s.7 1.2 1.6 1c.2-.7.3-1.4.1-2Z" />
      <path fill="#a568c4" stroke="#6d2f8c" strokeWidth={OUTLINE_SMALL} strokeLinejoin="round" d="M4.5 6.9c-.9-.2-1.7.2-1.7 1s.7 1.2 1.6 1c.2-.7.3-1.4.1-2Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO_SMALL} strokeLinejoin="round" d="M19.5 6.9c.9-.2 1.7.2 1.7 1s-.7 1.2-1.6 1c-.2-.7-.3-1.4-.1-2Z" />
      <path fill="#a568c4" stroke="#6d2f8c" strokeWidth={OUTLINE_SMALL} strokeLinejoin="round" d="M19.5 6.9c.9-.2 1.7.2 1.7 1s-.7 1.2-1.6 1c-.2-.7-.3-1.4-.1-2Z" />
      <rect fill="#8a3fb0" stroke="none" x="6.4" y="5.7" width="11.2" height="1.7" rx="0.85" />
      <path stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" d="M12 9.3v5.4" />
      <ellipse fill="#fff" opacity="0.45" cx="9.6" cy="9.8" rx="0.9" ry="1.3" />
    </>
  ),
  nap: (
    <>
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      <path fill="#7a3d99" stroke="#4f2569" strokeWidth={OUTLINE} strokeLinejoin="round" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      <path fill="#f4c94f" stroke="none" d="M18.3 3l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z" />
      <ellipse fill="#fff" opacity="0.22" cx="12.5" cy="8.2" rx="1.6" ry="2.2" />
    </>
  ),
  bedtime: (
    <>
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M4 10.5V19h16.5v-6.5a2.5 2.5 0 0 0-2.5-2.5H4Z" />
      <path fill="#a3456e" stroke="#6f2c4a" strokeWidth={OUTLINE} strokeLinejoin="round" d="M4 10.5V19h16.5v-6.5a2.5 2.5 0 0 0-2.5-2.5H4Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M4 12.5h16.5v3.3H4Z" />
      <path fill="#c97b98" stroke="#6f2c4a" strokeWidth={OUTLINE} strokeLinejoin="round" d="M4 12.5h16.5v3.3H4Z" />
      <circle fill="#fff" stroke="#6f2c4a" strokeWidth="1" cx="6.6" cy="9" r="1.9" />
      <ellipse fill="#fff" opacity="0.5" cx="8.5" cy="13.3" rx="2.1" ry="0.8" />
    </>
  ),
  wake: (
    <>
      <path fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" d={RAY_D} />
      <path fill="none" stroke="#c98f26" strokeWidth="1.6" strokeLinecap="round" d={RAY_D} />
      <circle fill="#fff" stroke="#fff" strokeWidth={HALO} cx="12" cy="12" r="4.2" />
      <circle fill="#e8b955" stroke="#c98f26" strokeWidth={OUTLINE} cx="12" cy="12" r="4.2" />
      <ellipse fill="#fff" opacity="0.5" cx="10.5" cy="10.3" rx="1.1" ry="1.5" />
    </>
  ),
  medicine: (
    <>
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M6 8h12l-1 3.2c-.2.6-.2 1.2 0 1.8l1.6 4.6a2 2 0 0 1-1.9 2.4H7.3a2 2 0 0 1-1.9-2.4L7 13c.2-.6.2-1.2 0-1.8L6 8Z" />
      <path fill="#cf4568" stroke="#8f2743" strokeWidth={OUTLINE} strokeLinejoin="round" d="M6 8h12l-1 3.2c-.2.6-.2 1.2 0 1.8l1.6 4.6a2 2 0 0 1-1.9 2.4H7.3a2 2 0 0 1-1.9-2.4L7 13c.2-.6.2-1.2 0-1.8L6 8Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO} strokeLinejoin="round" d="M7.6 13.2h8.8l1 4.2a1.3 1.3 0 0 1-1.3 1.6H7.9a1.3 1.3 0 0 1-1.3-1.6Z" />
      <path fill="#f2a9bc" stroke="#8f2743" strokeWidth={OUTLINE} strokeLinejoin="round" d="M7.6 13.2h8.8l1 4.2a1.3 1.3 0 0 1-1.3 1.6H7.9a1.3 1.3 0 0 1-1.3-1.6Z" />
      <path fill="#fff" stroke="#fff" strokeWidth={HALO_SMALL} strokeLinejoin="round" d="M9 3h6v2.6a2.6 2.6 0 0 1-6 0Z" />
      <path fill="#fff" stroke="#8f2743" strokeWidth={OUTLINE_SMALL} strokeLinejoin="round" d="M9 3h6v2.6a2.6 2.6 0 0 1-6 0Z" />
      <path fill="#fff" stroke="none" d="M9.5 15.2h5v1.1h-5Z" />
      <ellipse fill="#fff" opacity="0.4" cx="8.4" cy="9.6" rx="0.8" ry="1.1" />
    </>
  ),
};

// `phase` drives the loading-spinner / success-check / error-x swap on top
// of the normal category icon, once a tap has actually kicked off a save —
// see the `phase` state and `setButtonPhase`/inline phase state in whatever
// screen is rendering this.
export function Icon({ name, phase }) {
  return (
    <span className="icon-disc" aria-hidden="true">
      {phase === 'loading' ? (
        <span className="btn-spinner" />
      ) : phase === 'success' ? (
        <svg className="btn-check" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
      ) : phase === 'error' ? (
        <svg className="btn-check" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
      ) : (
        // No default fill/stroke/currentColor here — the sticker paths in
        // ICON_PATHS carry their own explicit colors, unlike the old
        // line-art set which relied on inheriting currentColor from the
        // button. `icon-glyph` is just a hook for the drop-shadow (and its
        // pressed-state dimming) in globals.css.
        <svg className="icon-glyph" viewBox="0 0 24 24">
          {ICON_PATHS[name]}
        </svg>
      )}
    </span>
  );
}

// Turns a phase ('loading' | 'success' | 'error' | undefined) into the CSS
// modifier class that swaps that button's icon-disc color and, for errors,
// plays a small shake — see the shared rules in globals.css.
export function phaseClass(phase) {
  return phase ? `is-${phase}` : '';
}

// Extra "· 4 oz" / "· Poop" suffix for a Recent Activity row, when the
// underlying event has feed_ounces / diaper_detail recorded.
export function activityDetailSuffix(raw) {
  if (raw.type === 'feed' && raw.feed_ounces != null) return ` · ${raw.feed_ounces} oz`;
  if (raw.type === 'diaper' && raw.diaper_detail) return ` · ${DIAPER_DETAIL_LABELS[raw.diaper_detail] || raw.diaper_detail}`;
  return '';
}

// Maps a Recent Activity row to the same category color used on the Log
// screen's button grid (.btn-feed/.btn-diaper/etc.), via the CSS class
// below — Recent is the one screen that's purely a list of these
// categories, so it's the place a color cue is worth the most, but it was
// the only screen not drawing on the palette the rest of the app already
// established. A merged nap_start/nap_end pair comes through as
// kind: 'nap' (see buildActivityGroups) rather than a raw event type, so
// that's checked first.
export function activityDotClass(item) {
  if (item.kind === 'nap') return 'activity-dot-nap';
  const type = item.type;
  if (type === 'nap_start' || type === 'nap_end') return 'activity-dot-nap';
  if (type === 'sleep_start') return 'activity-dot-sleep-start';
  if (type === 'sleep_end') return 'activity-dot-sleep-end';
  return `activity-dot-${type}`;
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

// Turns a computeStatus() result into the list of currently-overdue
// categories with their user-facing label + "Late by …" detail, for the Log
// screen's own overdue banner. (Push notifications are computed
// independently, by the Supabase Edge Function in
// supabase/functions/check-overdue — see the note above app/page.js's
// overdueItems for why.) `now` is passed in rather than read internally so
// callers can reuse the same timestamp they already computed status against.
export function overdueSummary(status, now) {
  if (!status) return [];
  const items = [];
  if (status.feed.overdue) {
    items.push({ key: 'feed', label: 'Feed', detail: `Late by ${formatDurationWords(status.feed.hoursSince - status.feed.avgHours)}` });
  }
  if (status.diaper.overdue) {
    items.push({ key: 'diaper', label: 'Diaper', detail: `Late by ${formatDurationWords(status.diaper.hoursSince - status.diaper.avgHours)}` });
  }
  if (status.nap.overdue) {
    items.push({ key: 'nap', label: 'Nap', detail: `Late by ${formatDurationWords(status.nap.hoursSince - status.nap.avgHours)}` });
  }
  if (status.sleep.overdue) {
    items.push({ key: 'sleep', label: 'Night sleep', detail: `Late by ${formatDurationWords(status.sleep.hoursSince)}` });
  }
  if (status.medicine.overdue) {
    // Measured from the scheduled dose time itself (lastScheduledSlot), not
    // from graceDeadline — matching how Feed/Diaper/Night sleep all report
    // lateness from their own due time rather than from whatever grace/
    // threshold pushed them into "overdue" in the first place.
    const lateHours = status.medicine.lastScheduledSlot
      ? Math.max(0, (now.getTime() - new Date(status.medicine.lastScheduledSlot).getTime()) / (1000 * 60 * 60))
      : 0;
    items.push({ key: 'medicine', label: 'Medicine', detail: `Late by ${formatDurationWords(lateHours)}` });
  }
  return items;
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

// How far "now" has traveled from the last logged event toward the
// predicted due time, as a 0–1 fraction — drives the Next-up card's
// progress bar. Kept separate from nextUpContent() (which already has one
// return statement per state per category) rather than threading a new
// field through every branch there. Takes `now` and recomputes elapsed
// time itself rather than trusting status[key].hoursSince — night sleep's
// on-track branch (lib/logic.js) deliberately leaves hoursSince null even
// though real time has passed since wake-up (there's no "approaching
// bedtime" concept for it, only "past bedtime or not"), which would've
// made this always render 0% for Bedtime specifically. Returns null when
// there's nothing to show a bar for (no prior event to measure from, or a
// zero/negative window).
export function nextUpProgress(status, key, now) {
  const s = status[key];
  if (!s?.dueAt || !s?.lastEventTime) return null;
  const dueMs = new Date(s.dueAt).getTime();
  const lastMs = new Date(s.lastEventTime).getTime();
  const fullWindowHours = (dueMs - lastMs) / (1000 * 60 * 60);
  if (!(fullWindowHours > 0)) return null;
  const elapsedHours = (now.getTime() - lastMs) / (1000 * 60 * 60);
  return Math.max(0, Math.min(1, elapsedHours / fullWindowHours));
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
        <span className={`chevron ${patternOpen ? 'open' : ''}`}>{'▾'}</span>
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
