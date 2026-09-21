'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { TabBar } from '../lib/TabBar';
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
} from '../lib/homeUi';

const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Feed/Diaper/Medicine don't change appearance after a tap the way the
// nap/sleep toggle buttons do (those flip to their "end" state as soon as
// the optimistic insert lands, so a fast second tap hits a different
// button). A real double-tap or two caregivers logging the same moment
// within this window gets a confirm step instead of silently creating a
// second row that skews the rolling averages.
const DUPLICATE_GUARD_SECONDS = 60;

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
const NEXTUP_ICON = { feed: 'feed', diaper: 'diaper', nap: 'nap', sleep: 'bedtime' };

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
    for (const e of events) {
      if (localDateStr(new Date(e.event_time), tz) !== todayKey) continue;
      if (e.type === 'feed' && typeof e.feed_ounces === 'number') ounces += e.feed_ounces;
      else if (e.type === 'diaper') {
        if (e.diaper_detail === 'pee' || e.diaper_detail === 'both') wet++;
        if (e.diaper_detail === 'poop' || e.diaper_detail === 'both') dirty++;
      }
    }
    return { ounces, wet, dirty };
  }, [events, config, now]);

  const timezone = config?.timezone || 'America/New_York';
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
  // Shared with the server-side overdue-check route (app/api/check-overdue)
  // via lib/homeUi's overdueSummary, so "what counts as overdue" can't drift
  // between what this screen shows and what triggers a push notification.
  const overdueItems = useMemo(() => overdueSummary(status, now), [status, now]);

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <h1>Today</h1>
          {/* Purely decorative, matching the reference's heart glyph under
              "Today" — not a button (no click handler, no hover/press
              state) since there's no favorites feature behind it. */}
          <svg className="header-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.3 3.7c2-.5 4 .3 5.2 2 .3.4.9.4 1.2 0 1.2-1.7 3.2-2.5 5.2-2 3.3.8 4.7 4.3 3.3 7.5-2.5 4.7-10 9.3-10 9.3Z" />
          </svg>
        </div>
        <div className="header-right">
          {/* Reuses the fuller /upcoming schedule page as this icon's
              destination, matching the reference's calendar glyph with a
              real place to go instead of a decorative dead button. Theme
              toggle and Settings moved off this header entirely — Settings
              is now its own "Profile" tab, and its own page keeps a theme
              toggle of its own, so nothing is lost by dropping them from
              here to match the reference's single-icon header. */}
          <Link href="/upcoming" className="header-icon-btn" aria-label="Upcoming schedule">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
              <path d="M4 10h16M8 3.5v3M16 3.5v3" />
            </svg>
            <span className="header-icon-btn-label">Upcoming</span>
          </Link>
          <div className="header-datetime" suppressHydrationWarning>
            {new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'long', day: 'numeric', year: 'numeric' }).format(now)}
          </div>
        </div>
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

          {/* Skipped once 2+ things are overdue: the banner above already
              names every overdue category with its own late-by time and a
              tap into the same explain modal, so giving just the single
              worst offender a second, fuller writeup here double-counted
              it while the others sat at one line each — not wrong, just
              uneven billing among things that are equally late. With 0 or
              1 overdue this card is the only place that story gets told,
              so it stays. */}
          {overdueItems.length <= 1 && (nextUp ? (
            <div className={`nextup nextup-${nextUpTone} nextup-cat-${nextUpKey}`}>
              <div className="nextup-row">
                <Icon name={NEXTUP_ICON[nextUpKey] ?? nextUpKey} />
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
          ) : (
            <div className="nextup nextup-on-track">
              <div className="nextup-eyebrow">Getting started</div>
              <div className="nextup-headline">Tap Fed or Diaper to begin</div>
              <div className="nextup-sub">Her patterns will show up here once a bit of history builds up.</div>
            </div>
          ))}

          <div className="btn-grid">
            <button className={`log-btn log-btn-primary btn-feed ${phaseClass(phase.feed)}`} onClick={() => setFeedPickerOpen(true)}>
              <Icon name="feed" phase={phase.feed} />
              Fed
            </button>
            <button className={`log-btn log-btn-primary btn-diaper ${phaseClass(phase.diaper)}`} onClick={() => setDiaperPickerOpen(true)}>
              <Icon name="diaper" phase={phase.diaper} />
              Diaper
            </button>
          </div>

          <div className="stateful-grid">
            {status.nap.asleep ? (
              <button className={`stateful-btn filled nap-filled ${phaseClass(phase.nap)}`} onClick={() => logEvent('nap_end', 'Nap ended', {}, 'nap')}>
                <Icon name="nap" phase={phase.nap} />
                <span className="stateful-text">
                  <span className="stateful-label">End nap</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.nap.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className={`stateful-btn outline nap-outline ${phaseClass(phase.nap)}`} onClick={() => logEvent('nap_start', 'Nap started', {}, 'nap')}>
                <Icon name="nap" phase={phase.nap} />
                <span className="stateful-text">
                  <span className="stateful-label">Start nap</span>
                  <span className="stateful-sub">{status.nap.hoursSince != null ? `awake ${formatHours(status.nap.hoursSince)}` : 'no naps yet'}</span>
                </span>
                <span className="stateful-chevron" aria-hidden="true">&rsaquo;</span>
              </button>
            )}

            {status.sleep.asleep ? (
              <button className={`stateful-btn filled sleep-filled ${phaseClass(phase.sleep)}`} onClick={() => logEvent('sleep_end', 'Wake up', {}, 'sleep')}>
                <Icon name="wake" phase={phase.sleep} />
                <span className="stateful-text">
                  <span className="stateful-label">Wake Up</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.sleep.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className={`stateful-btn outline sleep-outline ${phaseClass(phase.sleep)}`} onClick={() => logEvent('sleep_start', 'Bedtime', {}, 'sleep')}>
                <Icon name="bedtime" phase={phase.sleep} />
                <span className="stateful-text">
                  <span className="stateful-label">Bedtime</span>
                  <span className="stateful-sub">usual {formatTimeOfDay(config.target_bedtime_local ?? '19:15')}</span>
                </span>
                <span className="stateful-chevron" aria-hidden="true">&rsaquo;</span>
              </button>
            )}
          </div>

          <button className={`medicine-row ${phaseClass(phase.medicine)}`} onClick={() => attemptLog('medicine', 'Medicine', {}, 'medicine')}>
            <span className="medicine-label">
              <Icon name="medicine" phase={phase.medicine} />
              Medicine
            </span>
            <span className="medicine-detail">
              {medicineNext ? `next window ${formatLocalTime(medicineNext.toISOString(), timezone)}` : 'no schedule set'}
            </span>
          </button>

          {today && (
            <>
              <div className="stats-caption">Today's stats</div>
              <div className="stats-row">
                <div className="stat-tile stat-tile-feed">
                  <div className="stat-tile-row">
                    <Icon name="feed" />
                    <div className="stat-tile-text">
                      <div className="stat-value">{today.feeds}</div>
                      <div className="stat-label">Feedings</div>
                    </div>
                  </div>
                  {todayExtra && <div className="stat-sub">Total: {todayExtra.ounces} oz</div>}
                </div>
                <div className="stat-tile stat-tile-diaper">
                  <div className="stat-tile-row">
                    <Icon name="diaper" />
                    <div className="stat-tile-text">
                      <div className="stat-value">{today.diapers}</div>
                      <div className="stat-label">Diapers</div>
                    </div>
                  </div>
                  {todayExtra && <div className="stat-sub">{todayExtra.wet} Wet &middot; {todayExtra.dirty} Dirty</div>}
                </div>
                <div className="stat-tile stat-tile-nap">
                  <div className="stat-tile-row">
                    <Icon name="nap" />
                    <div className="stat-tile-text">
                      <div className="stat-value">{formatHours(today.napMinutes / 60) || '0m'}</div>
                      <div className="stat-label">Sleep</div>
                    </div>
                  </div>
                  <div className="stat-sub">{today.naps} {today.naps === 1 ? 'nap' : 'naps'}</div>
                </div>
              </div>
            </>
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
            <div className="explain-body">{explainStatus(explainKey, status[explainKey], config, timezone)}</div>
            <button className="modal-btn-confirm form-save" onClick={() => setExplainKey(null)}>Got it</button>
          </div>
        </div>
      )}

      <TabBar active="log" />
    </div>
  );
}
