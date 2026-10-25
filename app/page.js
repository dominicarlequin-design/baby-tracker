'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { TabBar } from '../lib/TabBar';
import { SkyBackdrop, SkyGlyph } from '../lib/SkyBackdrop';
import { computeStatus, lastEventOf, localDateStr } from '../lib/logic';
import { dailySummaries } from '../lib/summaries';
import {
  formatLocalTime,
  formatHours,
  formatDurationWords,
  formatTimeOfDay,
  nextMedicineSlot,
  pickNextUp,
  nextUpContent,
  nextUpProgress,
  explainStatus,
  overdueSummary,
  Icon,
  phaseClass,
  TileIcon,
} from '../lib/homeUi';
import {
  dailyMilkTarget, milkStatus, milkStatusText, usualFeedsPerDay, nextBottle, showEveningNudge,
} from '../lib/milk';

const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Status card shown while she's napping or asleep for the night. The live
// duration is the headline (ticks with the page's 10s `now`), since "how
// long has she been down?" is the question at 2am, not the start time.
// Night sleep gets a deep plum card, naps a light lilac one, so the two
// states read differently at a glance.
function AsleepCard({ kind, since, now, timezone }) {
  const hours = (now.getTime() - new Date(since).getTime()) / 3600000;
  return (
    <div className={`nextup asleep-card asleep-${kind}`}>
      <div className="nextup-row">
        <TileIcon name={kind === 'nap' ? 'sleep' : 'bedtime'} />
        <div className="nextup-text">
          <div className="nextup-eyebrow">{kind === 'nap' ? 'Napping' : 'Sleeping'}</div>
          <div className="nextup-headline asleep-duration">{formatHours(hours)}</div>
          <div className="nextup-sub">Since {formatLocalTime(since, timezone)} · alerts paused</div>
        </div>
      </div>
    </div>
  );
}

// Feed/Diaper/Medicine don't change appearance after a tap the way the
// nap/sleep toggle buttons do (those flip to their "end" state as soon as
// the optimistic insert lands, so a fast second tap hits a different
// button). A real double-tap or two caregivers logging the same moment
// within this window gets a confirm step instead of silently creating a
// second row that skews the rolling averages.
const DUPLICATE_GUARD_SECONDS = 60;

// Remembers (per device) which local day the evening milk banner was
// dismissed on, so the X hides it for the rest of that day only.
const MILK_NUDGE_KEY = 'milkNudgeDismissedDay';

function formatSecondsAgo(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'} ago`;
}

// Bounds how much history is fetched/rescanned on every load and 60s tick.
// 30 days comfortably covers rolling-average sample windows without growing
// unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;

// Next-up's status key is one of feed/diaper/nap/sleep (matches status.*
// and the nextup-cat-* CSS classes); ICON_PATHS (lib/homeUi.js) has no
// "sleep" glyph of its own (night sleep shares its icon with the Bedtime
// button), hence the map.
const NEXTUP_ICON = { feed: 'feed', diaper: 'diaper', nap: 'sleep', sleep: 'bedtime', medicine: 'medicine' };

export default function Page() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [toastShow, setToastShow] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [feedPickerOpen, setFeedPickerOpen] = useState(false);
  const [diaperPickerOpen, setDiaperPickerOpen] = useState(false);
  const [explainKey, setExplainKey] = useState(null);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const [milkSheetOpen, setMilkSheetOpen] = useState(false);
  const [statsSheetOpen, setStatsSheetOpen] = useState(false);
  const [nudgeDismissedDay, setNudgeDismissedDay] = useState(null);
  const toastTimeoutRef = useRef(null);

  // Per-button loading/success/error state, keyed by category ('feed',
  // 'diaper', 'nap', 'sleep', 'medicine') rather than by event id — the
  // button a caregiver is looking at is the category tile itself, which
  // stays on screen across a tap (even the nap/sleep toggles just swap
  // which variant of the same slot renders), so keying on that instead of
  // the underlying event lets the tile show its own save in flight.
  const [phase, setPhase] = useState({});
  const phaseTimeoutsRef = useRef({});

  const setButtonPhase = useCallback((key, value, holdMs) => {
    clearTimeout(phaseTimeoutsRef.current[key]);
    setPhase(prev => ({ ...prev, [key]: value }));
    if (holdMs) {
      phaseTimeoutsRef.current[key] = setTimeout(() => {
        setPhase(prev => ({ ...prev, [key]: undefined }));
      }, holdMs);
    }
  }, []);

  useEffect(() => () => Object.values(phaseTimeoutsRef.current).forEach(clearTimeout), []);

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [configRes, eventsRes] = await Promise.all([
      supabase.from('baby_config').select('*').eq('id', 1).single(),
      supabase.from('baby_events').select('*').gte('event_time', since).order('event_time', { ascending: false }),
    ]);
    if (configRes.error) console.error(configRes.error);
    if (eventsRes.error) console.error(eventsRes.error);
    if (configRes.data) setConfig(configRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // keep the header clock and every "time since" display fresh without
  // needing a full refetch. 10s (not 60s) so the header clock never sits
  // a stale minute behind, and overdue/asleep-duration text updates
  // promptly instead of visibly lagging.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  useEffect(() => {
    try { setNudgeDismissedDay(localStorage.getItem(MILK_NUDGE_KEY)); } catch (e) {}
  }, []);

  const showToast = useCallback((message, opts = {}) => {
    clearTimeout(toastTimeoutRef.current);
    setToast({ message, actionLabel: opts.actionLabel, onAction: opts.onAction });
    setToastShow(true);
    toastTimeoutRef.current = setTimeout(() => setToastShow(false), opts.actionLabel ? 4000 : 2200);
  }, []);

  // Inserts optimistically so a tap feels instant and the rolling averages
  // driving the whole screen don't wait on a round trip. Wrapping the
  // supabase call in Promise.resolve() up front is what makes it safe to
  // await from both the toast's Undo handler and the code below — a
  // supabase-js query builder is a thenable that re-runs the request on
  // every `await`/`.then()`, so without this a fast Undo tap would fire a
  // second insert instead of reusing the first one's result.
  // `phaseKey` is optional — passed by the category buttons below so their
  // own icon can show a spinner while this insert is in flight and a
  // check (or an x) once it settles. Nothing else about the optimistic
  // insert/undo flow changes.
  const logEvent = useCallback((type, label, extra = {}, phaseKey = null) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const eventTime = new Date().toISOString();
    setEvents(prev => [{ id: tempId, type, event_time: eventTime, ...extra }, ...prev]);

    if (phaseKey) setButtonPhase(phaseKey, 'loading');

    const insertPromise = Promise.resolve(
      supabase.from('baby_events').insert({ type, event_time: eventTime, ...extra }).select().single()
    );

    showToast(`Logged: ${label}`, {
      actionLabel: 'Undo',
      onAction: async () => {
        const { data, error } = await insertPromise;
        if (!error && data) {
          await supabase.from('baby_events').delete().eq('id', data.id);
          setEvents(prev => prev.filter(e => e.id !== data.id));
        } else {
          setEvents(prev => prev.filter(e => e.id !== tempId));
        }
      },
    });

    // A floor on how long the spinner stays up, so it's actually visible
    // even when the insert resolves in well under a tenth of a second —
    // without this a fast connection would jump straight from tap to
    // success check with nothing perceptible in between.
    const MIN_PHASE_MS = 380;
    const minWait = phaseKey ? new Promise(resolve => setTimeout(resolve, MIN_PHASE_MS)) : null;

    insertPromise.then(async ({ data, error }) => {
      if (minWait) await minWait;
      if (error) {
        console.error(error);
        setEvents(prev => prev.filter(e => e.id !== tempId));
        showToast('Failed to log — try again');
        if (phaseKey) setButtonPhase(phaseKey, 'error', 1100);
        return;
      }
      setEvents(prev => prev.map(e => (e.id === tempId ? data : e)));
      if (phaseKey) setButtonPhase(phaseKey, 'success', 900);
    });
  }, [showToast, setButtonPhase]);

  // Gate in front of logEvent for the buttons that don't change appearance
  // after a tap (Feed, Diaper, Medicine) — if the same type was logged in
  // the last DUPLICATE_GUARD_SECONDS, ask before creating a second row
  // instead of silently doing it.
  const attemptLog = useCallback((type, label, extra = {}, phaseKey = null) => {
    const last = lastEventOf(events, type);
    if (last) {
      const secondsAgo = (Date.now() - new Date(last.event_time).getTime()) / 1000;
      if (secondsAgo >= 0 && secondsAgo < DUPLICATE_GUARD_SECONDS) {
        setPendingDuplicate({ type, label, extra, phaseKey, secondsAgo });
        return;
      }
    }
    logEvent(type, label, extra, phaseKey);
  }, [events, logEvent]);

  const status = useMemo(() => {
    if (!config) return null;
    return computeStatus(events, config, now);
  }, [events, config, now]);

  const today = useMemo(() => {
    if (!config) return null;
    return dailySummaries(events, config, 1)[0];
  }, [events, config, now]);

  // Small, purely-cosmetic stat-tile subcaptions matching the reference
  // ("Total: 18 oz", "1 Wet · 1 Dirty") — computed straight from `events`
  // here rather than added to lib/summaries.js's dailySummaries(), which is
  // shared with Patterns and has its own test coverage; these three numbers
  // are only ever needed on this one card, so a small local pass over
  // today's events is lower-risk than growing a shared, tested module for a
  // display-only detail. "Wet"/"Dirty" follow the same pee/poop/both detail
  // values the diaper picker already writes, with "both" counting toward
  // both totals since it's one diaper doing double duty.
  const todayExtra = useMemo(() => {
    if (!config) return null;
    const tz = config.timezone || 'America/New_York';
    const todayKey = localDateStr(now, tz);
    let ounces = 0;
    let wet = 0;
    let dirty = 0;
    const bottles = [];
    for (const e of events) {
      if (localDateStr(new Date(e.event_time), tz) !== todayKey) continue;
      if (e.type === 'feed' && typeof e.feed_ounces === 'number') {
        ounces += e.feed_ounces;
        bottles.push({ id: e.id, time: e.event_time, ounces: e.feed_ounces });
      } else if (e.type === 'diaper') {
        if (e.diaper_detail === 'pee' || e.diaper_detail === 'both') wet++;
        if (e.diaper_detail === 'poop' || e.diaper_detail === 'both') dirty++;
      }
    }
    bottles.sort((a, b) => new Date(a.time) - new Date(b.time));
    return { ounces, wet, dirty, bottles, todayKey };
  }, [events, config, now]);

  // Daily milk target (lib/milk.js): weight x 2.5 oz, capped at 32 oz.
  // Everything milk-related stays hidden until a weight is set on Profile,
  // so the Feedings card falls back to its plain "Total: N oz" line.
  const milk = useMemo(() => {
    if (!config || !todayExtra || !today) return null;
    const goal = dailyMilkTarget(config.weight_lbs);
    if (!goal) return null;
    const oz = todayExtra.ounces;
    const status = milkStatus(oz, goal.target);
    const pastDays = dailySummaries(events, config, 8).slice(0, -1);
    const next = nextBottle(oz, goal.target, today.feeds, usualFeedsPerDay(pastDays));
    const tz = config.timezone || 'America/New_York';
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
    return {
      ...goal,
      oz,
      status,
      statusText: milkStatusText(status, goal.capped),
      pct: Math.min(oz / goal.target, 1) * 100,
      next,
      nudge: showEveningNudge(oz, goal.target, hour) && nudgeDismissedDay !== todayExtra.todayKey,
    };
  }, [config, todayExtra, today, events, now, nudgeDismissedDay]);

  const dismissNudge = useCallback(() => {
    if (!todayExtra) return;
    setNudgeDismissedDay(todayExtra.todayKey);
    try { localStorage.setItem(MILK_NUDGE_KEY, todayExtra.todayKey); } catch (e) {}
  }, [todayExtra]);

  const timezone = config?.timezone || 'America/New_York';

  // "2h 27m ago" under Fed and Diaper, straight from the last logged event
  // (status.*.hoursSince is paused while she's asleep, so it can't be used).
  const agoText = (type) => {
    const last = lastEventOf(events, type);
    if (!last) return 'none yet';
    return `${formatHours((now.getTime() - new Date(last.event_time).getTime()) / 3600000)} ago`;
  };
  const nextUpKey = status ? pickNextUp(status, now) : null;
  const nextUp = nextUpKey ? nextUpContent(nextUpKey, status, config, timezone) : null;
  const nextUpTone = nextUpKey ? status[nextUpKey].state : null;
  const nextUpProgressValue = nextUpKey && status ? nextUpProgress(status, nextUpKey, now) : null;
  const medicineNext = config ? nextMedicineSlot(config, now) : null;

  // Every currently-overdue category at once, for the banner at the very
  // top of the page — the Next-up card below only ever surfaces the single
  // worst offender, so with two things overdue at the same time (e.g. Feed
  // and Diaper) the second one would otherwise go unnoticed without
  // checking the Upcoming page row by row.
  // This screen's own "what's overdue" judgment (via lib/homeUi's
  // overdueSummary) — the push-notification side lives entirely in the
  // Supabase Edge Function (supabase/functions/check-overdue), which keeps
  // its own embedded copy of lib/logic.js so it can run on its own 2-minute
  // cron without depending on the Next.js deployment. An earlier Next.js
  // API route (app/api/check-overdue) tried to share this logic directly
  // but was never actually wired to anything — removed as dead code.
  const overdueItems = useMemo(() => overdueSummary(status, now), [status, now]);

  return (
    <div className="wrap">
      <SkyBackdrop now={now} timezone={timezone} asleep={Boolean(status?.sleep?.asleep || status?.nap?.asleep)} />
      {/* Date sits above the title as a small eyebrow, heart rides inline
          after "Today", and the calendar button centers against both, so
          the header reads as one row instead of three loose pieces. */}
      <div className="header-row today-header">
        <div className="today-heading">
          <div className="today-date" suppressHydrationWarning>
            {new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now)}
            <SkyGlyph now={now} timezone={timezone} />
          </div>
          <h1>
            Today
            {/* Decorative only, no favorites feature behind it. */}
            <svg className="header-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.3 3.7c2-.5 4 .3 5.2 2 .3.4.9.4 1.2 0 1.2-1.7 3.2-2.5 5.2-2 3.3.8 4.7 4.3 3.3 7.5-2.5 4.7-10 9.3-10 9.3Z" />
            </svg>
          </h1>
        </div>
        <Link href="/upcoming" className="header-icon-btn" aria-label="Upcoming schedule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
            <path d="M4 10h16M8 3.5v3M16 3.5v3" />
          </svg>
        </Link>
      </div>

      {loading || !status ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          {overdueItems.length > 0 && (
            <div className="overdue-banner">
              <button
                className="overdue-banner-toggle"
                onClick={() => setOverdueOpen(o => !o)}
                aria-expanded={overdueOpen}
              >
                <span className="overdue-banner-title">
                  <span className="alert-badge" aria-hidden="true">!</span>
                  {overdueItems.length} overdue
                </span>
                <span className={`chevron ${overdueOpen ? 'open' : ''}`}>{'▾'}</span>
              </button>
              {overdueOpen && (
                <div className="overdue-banner-list">
                  {overdueItems.map(item => (
                    <button
                      key={item.key}
                      className="overdue-banner-item"
                      onClick={() => setExplainKey(item.key)}
                    >
                      <span>{item.label}</span>
                      <span className="overdue-banner-detail">{item.detail}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {milk?.nudge && (
            <div className="nextup nextup-on-track milk-nudge">
              <div className="nextup-eyebrow">Milk today</div>
              <div className="nextup-headline">{milk.oz} / {milk.target} oz so far</div>
              <div className="nextup-sub">Under 70% of today's target. Offer another bottle if she's hungry.</div>
              <button type="button" className="milk-nudge-close" aria-label="Dismiss for today" onClick={dismissNudge}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          )}

          {/* Skipped once 2+ things are overdue: the banner above already
              names every overdue category with its own late-by time and a
              tap into the same explain modal, so giving just the single
              worst offender a second, fuller writeup here double-counted
              it while the others sat at one line each — not wrong, just
              uneven billing among things that are equally late. With 0 or
              1 overdue this card is the only place that story gets told,
              so it stays. */}
          {overdueItems.length <= 1 && (status?.nap?.asleep ? (
            <AsleepCard kind="nap" since={status.nap.lastEventTime} now={now} timezone={timezone} />
          ) : nextUp ? (
            // Tappable: the sub-line is capped at two lines to keep Today
            // above the fold, so the full text (plus the usual "how this
            // is estimated" note) opens in the explain popup.
            <div
              className={`nextup nextup-${nextUpTone} nextup-cat-${nextUpKey} nextup-tappable`}
              role="button"
              tabIndex={0}
              aria-label={`${nextUp.eyebrow}: ${nextUp.headline}. Show details.`}
              onClick={() => setExplainKey(nextUpKey)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExplainKey(nextUpKey); } }}
            >
              <div className="nextup-row">
                {NEXTUP_ICON[nextUpKey] ? <TileIcon name={NEXTUP_ICON[nextUpKey]} /> : <Icon name={nextUpKey} />}
                <div className="nextup-text">
                  <div className={`nextup-eyebrow ${nextUp.lateBy ? 'category' : ''}`}>{nextUp.eyebrow}</div>
                  <div className="nextup-headline">
                    {nextUp.headline}
                    {nextUp.lateBy && <span className="nextup-lateby"> · {nextUp.lateBy}</span>}
                  </div>
                  <div className="nextup-sub">{nextUp.sub}</div>
                </div>
              </div>
              {nextUpProgressValue != null && (
                <div className="nextup-progress-track">
                  <div className="nextup-progress-fill" style={{ width: `${Math.round(nextUpProgressValue * 100)}%` }} />
                </div>
              )}
            </div>
          ) : status?.sleep?.asleep ? (
            <AsleepCard kind="sleep" since={status.sleep.lastEventTime} now={now} timezone={timezone} />
          ) : (
            <div className="nextup nextup-on-track">
              <div className="nextup-eyebrow">Getting started</div>
              <div className="nextup-headline">Tap Fed or Diaper to begin</div>
              <div className="nextup-sub">Her patterns will show up here once a bit of history builds up.</div>
            </div>
          ))}

          <div className="tile-grid">
            <button className={`tile-btn ${phaseClass(phase.feed)}`} onClick={() => setFeedPickerOpen(true)}>
              <TileIcon name="feed" phase={phase.feed} />
              <span className="tile-label">Fed</span>
              <span className="tile-sub">{agoText('feed')}</span>
            </button>
            <button className={`tile-btn ${phaseClass(phase.diaper)}`} onClick={() => setDiaperPickerOpen(true)}>
              <TileIcon name="diaper" phase={phase.diaper} />
              <span className="tile-label">Diaper</span>
              <span className="tile-sub">{agoText('diaper')}</span>
            </button>
            {status.nap.asleep ? (
              <button className={`tile-btn ${phaseClass(phase.nap)}`} onClick={() => logEvent('nap_end', 'Nap ended', {}, 'nap')}>
                <TileIcon name="sleep" phase={phase.nap} />
                <span className="tile-label">End nap</span>
                <span className="tile-sub">asleep {formatHours((now.getTime() - new Date(status.nap.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
              </button>
            ) : (
              <button className={`tile-btn ${phaseClass(phase.nap)}`} onClick={() => logEvent('nap_start', 'Nap started', {}, 'nap')}>
                <TileIcon name="sleep" phase={phase.nap} />
                <span className="tile-label">Start nap</span>
                <span className="tile-sub">{status.nap.hoursSince != null ? `awake ${formatHours(status.nap.hoursSince)}` : status.sleep.asleep ? 'after she wakes' : 'no naps yet'}</span>
              </button>
            )}
            {status.sleep.asleep ? (
              <button className={`tile-btn ${phaseClass(phase.sleep)}`} onClick={() => logEvent('sleep_end', 'Wake up', {}, 'sleep')}>
                <TileIcon name="bedtime" phase={phase.sleep} />
                <span className="tile-label">Wake Up</span>
                <span className="tile-sub">asleep {formatHours((now.getTime() - new Date(status.sleep.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
              </button>
            ) : (
              <button className={`tile-btn ${phaseClass(phase.sleep)}`} onClick={() => logEvent('sleep_start', 'Bedtime', {}, 'sleep')}>
                <TileIcon name="bedtime" phase={phase.sleep} />
                <span className="tile-label">Bedtime</span>
                <span className="tile-sub">usual {formatTimeOfDay(config.target_bedtime_local ?? '19:15')}</span>
              </button>
            )}
            <button className={`tile-btn ${phaseClass(phase.medicine)}`} onClick={() => attemptLog('medicine', 'Medicine', {}, 'medicine')}>
              <TileIcon name="medicine" phase={phase.medicine} />
              <span className="tile-label">Medicine</span>
              <span className="tile-sub">{medicineNext ? `next ${formatLocalTime(medicineNext.toISOString(), timezone)}` : 'no schedule'}</span>
            </button>
            <Link href="/journal" className="tile-btn">
              <TileIcon name="journal" />
              <span className="tile-label">Journal</span>
              <span className="tile-sub">write a note</span>
            </Link>
          </div>

          {today && (
            <button
              type="button"
              className="stats-pill"
              onClick={() => setStatsSheetOpen(true)}
              aria-label={`Today's stats: ${today.feeds} feedings, ${today.diapers} diapers, ${formatHours(today.napMinutes / 60) || '0m'} sleep. Open details.`}
            >
              <span className="stats-pill-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 19V11M12 19V5M19 19v-6" /></svg>
              </span>
              <span className="stats-pill-label">Stats</span>
              <span className="stats-pill-summary">
                {today.feeds} {today.feeds === 1 ? 'feed' : 'feeds'} · {today.diapers} {today.diapers === 1 ? 'diaper' : 'diapers'} · {formatHours(today.napMinutes / 60) || '0m'}
              </span>
              <svg className="stats-pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          )}
        </>
      )}

      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <span>{toast?.message}</span>
        {toast?.actionLabel && (
          <button
            className="toast-action"
            onClick={async () => {
              setToastShow(false);
              await toast.onAction?.();
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>

      {feedPickerOpen && (
        <div className="modal-overlay" onClick={() => setFeedPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">How many ounces?</div>
            <div className="picker-grid">
              {FEED_OUNCE_OPTIONS.map(oz => (
                <button
                  key={oz}
                  className="picker-btn"
                  onClick={() => {
                    attemptLog('feed', 'Fed', { feed_ounces: oz }, 'feed');
                    setFeedPickerOpen(false);
                  }}
                >
                  {oz} oz
                </button>
              ))}
            </div>
            <button
              className="modal-btn-skip"
              onClick={() => {
                attemptLog('feed', 'Fed', {}, 'feed');
                setFeedPickerOpen(false);
              }}
            >
              Skip — just log the time
            </button>
          </div>
        </div>
      )}

      {diaperPickerOpen && (
        <div className="modal-overlay" onClick={() => setDiaperPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Diaper</div>
            <div className="picker-grid-3">
              <button
                className="picker-btn"
                onClick={() => {
                  attemptLog('diaper', 'Diaper', { diaper_detail: 'pee' }, 'diaper');
                  setDiaperPickerOpen(false);
                }}
              >
                Pee
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  attemptLog('diaper', 'Diaper', { diaper_detail: 'poop' }, 'diaper');
                  setDiaperPickerOpen(false);
                }}
              >
                Poop
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  attemptLog('diaper', 'Diaper', { diaper_detail: 'both' }, 'diaper');
                  setDiaperPickerOpen(false);
                }}
              >
                Both
              </button>
            </div>
            <button
              className="modal-btn-skip"
              onClick={() => {
                attemptLog('diaper', 'Diaper', {}, 'diaper');
                setDiaperPickerOpen(false);
              }}
            >
              Skip — just log the time
            </button>
          </div>
        </div>
      )}

      {statsSheetOpen && today && (
        <div className="modal-overlay" onClick={() => setStatsSheetOpen(false)}>
          <div className="modal milk-sheet stats-sheet" role="dialog" aria-label="Today's stats" onClick={e => e.stopPropagation()}>
            <div className="milk-sheet-grabber" aria-hidden="true" />
            <div className="milk-sheet-head">
              <h2 className="milk-sheet-title">Today's stats</h2>
              <button type="button" className="milk-sheet-close" aria-label="Close" onClick={() => setStatsSheetOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="stats-row">
              {milk ? (
                <button
                  type="button"
                  className="stat-tile stat-tile-feed stat-tile-btn"
                  onClick={() => { setStatsSheetOpen(false); setMilkSheetOpen(true); }}
                  aria-label={`${today.feeds} feedings, ${milk.oz} of ${milk.target} ounces, ${milk.statusText}. Open Daily Milk.`}
                >
                  <div className="stat-tile-row">
                    <TileIcon name="feed" />
                    <div className="stat-tile-text">
                      <div className="stat-value">{today.feeds}</div>
                      <div className="stat-label">Feedings</div>
                    </div>
                  </div>
                  <div className="stat-sub">{milk.oz} / {milk.target} oz</div>
                </button>
              ) : (
                <div className="stat-tile stat-tile-feed">
                  <div className="stat-tile-row">
                    <TileIcon name="feed" />
                    <div className="stat-tile-text">
                      <div className="stat-value">{today.feeds}</div>
                      <div className="stat-label">Feedings</div>
                    </div>
                  </div>
                  {todayExtra && <div className="stat-sub">Total: {todayExtra.ounces} oz</div>}
                </div>
              )}
              <div className="stat-tile stat-tile-diaper">
                <div className="stat-tile-row">
                  <TileIcon name="diaper" />
                  <div className="stat-tile-text">
                    <div className="stat-value">{today.diapers}</div>
                    <div className="stat-label">Diapers</div>
                  </div>
                </div>
                {todayExtra && <div className="stat-sub">{todayExtra.wet} Wet &middot; {todayExtra.dirty} Dirty</div>}
              </div>
              <div className="stat-tile stat-tile-nap">
                <div className="stat-tile-row">
                  <TileIcon name="sleep" />
                  <div className="stat-tile-text">
                    <div className="stat-value">{formatHours(today.napMinutes / 60) || '0m'}</div>
                    <div className="stat-label">Sleep</div>
                  </div>
                </div>
                <div className="stat-sub">{today.naps} {today.naps === 1 ? 'nap' : 'naps'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {milkSheetOpen && milk && (
        <div className="modal-overlay" onClick={() => setMilkSheetOpen(false)}>
          <div className="modal milk-sheet" role="dialog" aria-label="Daily Milk" onClick={e => e.stopPropagation()}>
            <div className="milk-sheet-grabber" aria-hidden="true" />
            <div className="milk-sheet-head">
              <h2 className="milk-sheet-title">Daily Milk</h2>
              <button type="button" className="milk-sheet-close" aria-label="Close" onClick={() => setMilkSheetOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="milk-progress-card">
              <div className="milk-progress-top">
                <span className="milk-progress-head">{milk.oz} oz of {milk.target} oz today</span>
                <span className="milk-progress-left">
                  {milk.oz > milk.target ? `${Math.round((milk.oz - milk.target) * 10) / 10} oz over` : `${Math.round(milk.next.left * 10) / 10} oz to go`}
                </span>
              </div>
              <div
                className={`milk-bar milk-bar-lg milk-${milk.status}`}
                role="progressbar"
                aria-label="Milk today"
                aria-valuemin={0}
                aria-valuemax={milk.target}
                aria-valuenow={milk.oz}
              >
                <div className="milk-bar-fill" style={{ width: `${milk.pct}%` }} />
              </div>
              <div className="milk-progress-note">
                Target: {config.weight_lbs} lbs × 2.5 oz{milk.capped ? ', capped at 32 oz' : ''}
              </div>
            </div>

            <div className="stats-caption">Today's bottles</div>
            {todayExtra.bottles.length ? (
              <ul className="milk-bottles">
                {todayExtra.bottles.map(b => (
                  <li key={b.id} className="milk-bottle">
                    <TileIcon name="feed" />
                    <span className="milk-bottle-time">{formatLocalTime(b.time, timezone)}</span>
                    <span className="milk-bottle-oz">{b.ounces} oz</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="milk-bottles milk-bottles-empty">No bottles with ounces logged yet today.</div>
            )}

            <div className="milk-next">
              {milk.next.left > 0 ? (
                <>
                  <div className="milk-next-head">Next bottle: about {milk.next.ounces} oz</div>
                  <div className="milk-next-sub">
                    {Math.round(milk.next.left * 10) / 10} oz left over her usual {milk.next.feedsLeft} more {milk.next.feedsLeft === 1 ? 'feed' : 'feeds'}
                  </div>
                </>
              ) : (
                <>
                  <div className="milk-next-head">Target reached for today</div>
                  <div className="milk-next-sub">Keep following her hunger cues.</div>
                </>
              )}
            </div>

            <p className="milk-caption">A guide, not a rule. Hunger cues come first.</p>
          </div>
        </div>
      )}

      {pendingDuplicate && (
        <div className="modal-overlay" onClick={() => setPendingDuplicate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log {pendingDuplicate.label} again?</div>
            <div className="explain-body">
              {pendingDuplicate.label} was already logged {formatSecondsAgo(pendingDuplicate.secondsAgo)}.
            </div>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setPendingDuplicate(null)}>Cancel</button>
              <button
                className="modal-btn-confirm"
                onClick={() => {
                  logEvent(pendingDuplicate.type, pendingDuplicate.label, pendingDuplicate.extra, pendingDuplicate.phaseKey);
                  setPendingDuplicate(null);
                }}
              >
                Log anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {explainKey && status && (
        <div className="modal-overlay" onClick={() => setExplainKey(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">How this is estimated</div>
            {explainKey === nextUpKey && nextUp?.sub && <div className="explain-lead">{nextUp.sub}</div>}
            <div className="explain-body">{explainStatus(explainKey, status[explainKey], config, timezone)}</div>
            <button className="modal-btn-confirm form-save" onClick={() => setExplainKey(null)}>Got it</button>
          </div>
        </div>
      )}

      <TabBar active="log" />
    </div>
  );
}
