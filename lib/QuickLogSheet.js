'use client';

// The "+" tab's universal quick-log popup — reachable from every screen
// (Today, History, Insights, Profile), not just the Today page's own
// button grid. Dom's own words when asked to pick between options for what
// "+" should do: "Universal quick-log popup... Tap + from ANY screen and a
// small popup appears with one-tap buttons for Fed/Diaper/Nap/Bedtime/
// Medicine. Tap one, it logs instantly, popup closes."
//
// This is intentionally a SEPARATE, self-contained data path from the
// Today page's own logging (app/page.js), not a shared hook — Today's
// version is a heavily-tuned, well-exercised piece of the app (optimistic
// insert, Undo toast, per-button phase animation, rolling-average-safe
// history window) and reworking it to be called from two places at once
// risked introducing a regression there for the sake of this new popup.
// Instead this fetches its own small, fresh slice of state each time it
// opens and reuses the exact same pure helpers (computeStatus, lastEventOf)
// and the exact same Icon/ICON_PATHS glyphs (lib/homeUi.js) so nap/bedtime
// wording and icons can never drift from what Today shows. The one
// difference from Today's picker: no optimistic insert/Undo here, since
// the popup itself already gives a clear "saved" checkmark before closing
// — Undo is only worth the extra plumbing on the screen you're staring at
// anyway.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { computeStatus, lastEventOf } from './logic';
import { Icon, phaseClass } from './homeUi';

const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const DUPLICATE_GUARD_SECONDS = 60;
// Only needs enough history for computeStatus's asleep/overdue state and
// the duplicate-guard check above — nowhere near Today's 30-day rolling
// average window, since none of that is shown in this popup.
const HISTORY_HOURS = 48;

const QuickLogContext = createContext(null);

export function useQuickLog() {
  const ctx = useContext(QuickLogContext);
  if (!ctx) throw new Error('useQuickLog must be used within QuickLogProvider');
  return ctx;
}

function formatSecondsAgo(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'} ago`;
}

export function QuickLogProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'feed' | 'diaper'
  const [phase, setPhase] = useState({});
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const closeTimeoutRef = useRef(null);
  const phaseTimeoutsRef = useRef({});

  useEffect(() => () => {
    clearTimeout(closeTimeoutRef.current);
    Object.values(phaseTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  const setButtonPhase = useCallback((key, value, holdMs) => {
    clearTimeout(phaseTimeoutsRef.current[key]);
    setPhase(prev => ({ ...prev, [key]: value }));
    if (holdMs) {
      phaseTimeoutsRef.current[key] = setTimeout(() => {
        setPhase(prev => ({ ...prev, [key]: undefined }));
      }, holdMs);
    }
  }, []);

  const openQuickLog = useCallback(async () => {
    setView('menu');
    setPendingDuplicate(null);
    setPhase({});
    setOpen(true);
    setLoading(true);
    const since = new Date(Date.now() - HISTORY_HOURS * 60 * 60 * 1000).toISOString();
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

  const closeQuickLog = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(false);
  }, []);

  const logEvent = useCallback((type, label, extra, phaseKey) => {
    const eventTime = new Date().toISOString();
    setButtonPhase(phaseKey, 'loading');
    supabase.from('baby_events').insert({ type, event_time: eventTime, ...extra }).select().single()
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setButtonPhase(phaseKey, 'error', 1100);
          return;
        }
        setEvents(prev => [data, ...prev]);
        setButtonPhase(phaseKey, 'success', 900);
        // Give the checkmark a moment to actually be seen before the whole
        // sheet disappears — matches the "tap one, it logs instantly,
        // popup closes" behavior Dom asked for without it feeling instant
        // to the point of looking broken.
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => setOpen(false), 950);
      });
  }, [setButtonPhase]);

  const attemptLog = useCallback((type, label, extra, phaseKey) => {
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

  const status = config ? computeStatus(events, config, new Date()) : null;

  return (
    <QuickLogContext.Provider value={{ openQuickLog, closeQuickLog }}>
      {children}
      {open && (
        <div className="modal-overlay quicklog-overlay" onClick={closeQuickLog}>
          <div className="modal quicklog-sheet" onClick={e => e.stopPropagation()}>
            {loading || !status ? (
              <div className="modal-title">Loading…</div>
            ) : view === 'feed' ? (
              <>
                <div className="modal-title">How many ounces?</div>
                <div className="picker-grid">
                  {FEED_OUNCE_OPTIONS.map(oz => (
                    <button key={oz} className="picker-btn" onClick={() => attemptLog('feed', 'Fed', { feed_ounces: oz }, 'feed')}>
                      {oz} oz
                    </button>
                  ))}
                </div>
                <button className="modal-btn-skip" onClick={() => attemptLog('feed', 'Fed', {}, 'feed')}>
                  Skip — just log the time
                </button>
              </>
            ) : view === 'diaper' ? (
              <>
                <div className="modal-title">Diaper</div>
                <div className="picker-grid-3">
                  <button className="picker-btn" onClick={() => attemptLog('diaper', 'Diaper', { diaper_detail: 'pee' }, 'diaper')}>Pee</button>
                  <button className="picker-btn" onClick={() => attemptLog('diaper', 'Diaper', { diaper_detail: 'poop' }, 'diaper')}>Poop</button>
                  <button className="picker-btn" onClick={() => attemptLog('diaper', 'Diaper', { diaper_detail: 'both' }, 'diaper')}>Both</button>
                </div>
                <button className="modal-btn-skip" onClick={() => attemptLog('diaper', 'Diaper', {}, 'diaper')}>
                  Skip — just log the time
                </button>
              </>
            ) : (
              <>
                <div className="modal-title">Quick log</div>
                <div className="quicklog-grid">
                  <button className={`quicklog-btn quicklog-feed ${phaseClass(phase.feed)}`} onClick={() => setView('feed')}>
                    <Icon name="feed" phase={phase.feed} />
                    <span>Fed</span>
                  </button>
                  <button className={`quicklog-btn quicklog-diaper ${phaseClass(phase.diaper)}`} onClick={() => setView('diaper')}>
                    <Icon name="diaper" phase={phase.diaper} />
                    <span>Diaper</span>
                  </button>
                  <button
                    className={`quicklog-btn quicklog-nap ${phaseClass(phase.nap)}`}
                    onClick={() => status.nap.asleep
                      ? logEvent('nap_end', 'Nap ended', {}, 'nap')
                      : attemptLog('nap_start', 'Nap started', {}, 'nap')}
                  >
                    <Icon name="nap" phase={phase.nap} />
                    <span>{status.nap.asleep ? 'End nap' : 'Start nap'}</span>
                  </button>
                  <button
                    className={`quicklog-btn quicklog-sleep ${phaseClass(phase.sleep)}`}
                    onClick={() => status.sleep.asleep
                      ? logEvent('sleep_end', 'Wake up', {}, 'sleep')
                      : attemptLog('sleep_start', 'Bedtime', {}, 'sleep')}
                  >
                    <Icon name="bedtime" phase={phase.sleep} />
                    <span>{status.sleep.asleep ? 'Wake up' : 'Bedtime'}</span>
                  </button>
                  <button className={`quicklog-btn quicklog-medicine ${phaseClass(phase.medicine)}`} onClick={() => attemptLog('medicine', 'Medicine', {}, 'medicine')}>
                    <Icon name="medicine" phase={phase.medicine} />
                    <span>Medicine</span>
                  </button>
                </div>
              </>
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
          </div>
        </div>
      )}
    </QuickLogContext.Provider>
  );
}
