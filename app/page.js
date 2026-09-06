'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { computeStatus } from '../lib/logic';
import { dailySummaries } from '../lib/summaries';
import {
  formatLocalTime,
  formatHours,
  formatDurationWords,
  formatTimeOfDay,
  nextMedicineSlot,
  pickNextUp,
  nextUpContent,
  explainStatus,
} from '../lib/homeUi';

const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Bounds how much history is fetched/rescanned on every load and 60s tick.
// 30 days comfortably covers rolling-average sample windows without growing
// unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;

// Line-icon paths for the Log buttons, each rendered on a small tinted
// disc (colored via CSS on the parent button class, see .icon-disc in
// globals.css) rather than a flat glyph — chosen over emoji so they can be
// tinted to match each button's own palette and render identically
// everywhere instead of varying by OS.
const ICON_PATHS = {
  feed: (
    <>
      <path d="M10 2h4M10.5 2v3.2c0 .5-.2 1-.6 1.4l-1 1c-.6.6-.9 1.4-.9 2.2V19a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V9.8c0-.8-.3-1.6-.9-2.2l-1-1c-.4-.4-.6-.9-.6-1.4V2" />
      <path d="M9 13h6" />
    </>
  ),
  diaper: (
    <>
      <path d="M4 5h16v4.5c0 5-3.5 8.5-8 9.5-4.5-1-8-4.5-8-9.5V5Z" />
      <path d="M4 9.5c2 1 5 1 8 1s6 0 8-1" />
    </>
  ),
  nap: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />,
  bedtime: (
    <>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      <path d="M17 3.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />
    </>
  ),
  wake: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </>
  ),
  medicine: (
    <>
      <path d="M9 3h6M12 3v4" />
      <path d="M6 8h12l-1 3.2c-.2.6-.2 1.2 0 1.8l1.6 4.6a2 2 0 0 1-1.9 2.4H7.3a2 2 0 0 1-1.9-2.4L7 13c.2-.6.2-1.2 0-1.8L6 8Z" />
      <path d="M8.5 13.5h7" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <span className="icon-disc" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name]}
      </svg>
    </span>
  );
}

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
  const toastTimeoutRef = useRef(null);

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
  const logEvent = useCallback((type, label, extra = {}) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const eventTime = new Date().toISOString();
    setEvents(prev => [{ id: tempId, type, event_time: eventTime, ...extra }, ...prev]);

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

    insertPromise.then(({ data, error }) => {
      if (error) {
        console.error(error);
        setEvents(prev => prev.filter(e => e.id !== tempId));
        showToast('Failed to log — try again');
        return;
      }
      setEvents(prev => prev.map(e => (e.id === tempId ? data : e)));
    });
  }, [showToast]);

  const status = useMemo(() => {
    if (!config) return null;
    return computeStatus(events, config, now);
  }, [events, config, now]);

  const today = useMemo(() => {
    if (!config) return null;
    return dailySummaries(events, config, 1)[0];
  }, [events, config, now]);

  const timezone = config?.timezone || 'America/New_York';
  const nextUpKey = status ? pickNextUp(status, now) : null;
  const nextUp = nextUpKey ? nextUpContent(nextUpKey, status, config, timezone) : null;
  const nextUpTone = nextUpKey ? status[nextUpKey].state : null;
  const medicineNext = config ? nextMedicineSlot(config, now) : null;

  // Every currently-overdue category at once, for the banner at the very
  // top of the page — the Next-up card below only ever surfaces the single
  // worst offender, so with two things overdue at the same time (e.g. Feed
  // and Diaper) the second one would otherwise go unnoticed without
  // checking the Upcoming page row by row.
  const overdueItems = useMemo(() => {
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
      // Measured from the scheduled dose time itself (lastScheduledSlot),
      // not from graceDeadline — matching how Feed/Diaper/Night sleep all
      // report lateness from their own due time rather than from whatever
      // grace/threshold pushed them into "overdue" in the first place.
      const lateHours = status.medicine.lastScheduledSlot
        ? Math.max(0, (now.getTime() - new Date(status.medicine.lastScheduledSlot).getTime()) / (1000 * 60 * 60))
        : 0;
      items.push({ key: 'medicine', label: 'Medicine', detail: `Late by ${formatDurationWords(lateHours)}` });
    }
    return items;
  }, [status, now]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Today</h1>
        <div className="header-right">
          <div className="header-datetime" suppressHydrationWarning>
            {new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(now)}
            {' · '}
            {formatLocalTime(now.toISOString(), timezone)}
          </div>
          <Link href="/settings" className="header-settings-link">Settings</Link>
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
                <span className={`chevron ${overdueOpen ? 'open' : ''}`}>{'>'}</span>
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

          {nextUp ? (
            <div className={`nextup nextup-${nextUpTone}`}>
              <div className={`nextup-eyebrow ${nextUp.lateBy ? 'category' : ''}`}>{nextUp.eyebrow}</div>
              <div className="nextup-headline">
                {nextUp.headline}
                {nextUp.lateBy && <span className="nextup-lateby"> · {nextUp.lateBy}</span>}
              </div>
              <div className="nextup-sub">{nextUp.sub}</div>
            </div>
          ) : (
            <div className="nextup nextup-on-track">
              <div className="nextup-eyebrow">Getting started</div>
              <div className="nextup-headline">Tap Fed or Diaper to begin</div>
              <div className="nextup-sub">Her patterns will show up here once a bit of history builds up.</div>
            </div>
          )}

          <div className="btn-grid">
            <button className="log-btn log-btn-primary btn-feed" onClick={() => setFeedPickerOpen(true)}>
              <Icon name="feed" />
              Fed
            </button>
            <button className="log-btn log-btn-primary btn-diaper" onClick={() => setDiaperPickerOpen(true)}>
              <Icon name="diaper" />
              Diaper
            </button>
          </div>

          <div className="stateful-grid">
            {status.nap.asleep ? (
              <button className="stateful-btn filled nap-filled" onClick={() => logEvent('nap_end', 'Nap ended')}>
                <Icon name="nap" />
                <span className="stateful-text">
                  <span className="stateful-label">End nap</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.nap.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className="stateful-btn outline nap-outline" onClick={() => logEvent('nap_start', 'Nap started')}>
                <Icon name="nap" />
                <span className="stateful-text">
                  <span className="stateful-label">Start nap</span>
                  <span className="stateful-sub">{status.nap.hoursSince != null ? `awake ${formatHours(status.nap.hoursSince)}` : 'no naps yet'}</span>
                </span>
              </button>
            )}

            {status.sleep.asleep ? (
              <button className="stateful-btn filled sleep-filled" onClick={() => logEvent('sleep_end', 'Wake up')}>
                <Icon name="wake" />
                <span className="stateful-text">
                  <span className="stateful-label">Wake Up</span>
                  <span className="stateful-sub">asleep {formatHours((now.getTime() - new Date(status.sleep.lastEventTime).getTime()) / (1000 * 60 * 60))}</span>
                </span>
              </button>
            ) : (
              <button className="stateful-btn outline sleep-outline" onClick={() => logEvent('sleep_start', 'Bedtime')}>
                <Icon name="bedtime" />
                <span className="stateful-text">
                  <span className="stateful-label">Bedtime</span>
                  <span className="stateful-sub">usual {formatTimeOfDay(config.target_bedtime_local ?? '19:15')}</span>
                </span>
              </button>
            )}
          </div>

          <button className="medicine-row" onClick={() => logEvent('medicine', 'Medicine')}>
            <span className="medicine-label">
              <Icon name="medicine" />
              Medicine
            </span>
            <span className="medicine-detail">
              {medicineNext ? `next window ${formatLocalTime(medicineNext.toISOString(), timezone)}` : 'no schedule set'}
            </span>
          </button>

          {today && (
            <div className="stats-row">
              <div className="stat-tile">
                <div className="stat-value">{today.feeds}</div>
                <div className="stat-label">Feeds</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{formatHours(today.napMinutes / 60) || '0m'}</div>
                <div className="stat-label">Napped ({today.naps})</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value">{today.diapers}</div>
                <div className="stat-label">Diapers</div>
              </div>
            </div>
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
                    logEvent('feed', 'Fed', { feed_ounces: oz });
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
                logEvent('feed', 'Fed');
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
                  logEvent('diaper', 'Diaper', { diaper_detail: 'pee' });
                  setDiaperPickerOpen(false);
                }}
              >
                Pee
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  logEvent('diaper', 'Diaper', { diaper_detail: 'poop' });
                  setDiaperPickerOpen(false);
                }}
              >
                Poop
              </button>
              <button
                className="picker-btn"
                onClick={() => {
                  logEvent('diaper', 'Diaper', { diaper_detail: 'both' });
                  setDiaperPickerOpen(false);
                }}
              >
                Both
              </button>
            </div>
            <button
              className="modal-btn-skip"
              onClick={() => {
                logEvent('diaper', 'Diaper');
                setDiaperPickerOpen(false);
              }}
            >
              Skip — just log the time
            </button>
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

      <nav className="tab-bar">
        <span className="tab-item tab-active">Log</span>
        <Link href="/upcoming" className="tab-item">Upcoming</Link>
        <Link href="/recent" className="tab-item">Recent</Link>
        <Link href="/patterns" className="tab-item">Patterns</Link>
      </nav>
    </div>
  );
}
