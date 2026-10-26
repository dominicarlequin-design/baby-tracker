'use client';

// Keeps both parents' phones in step so the same feed or diaper doesn't get
// logged twice.
//
// - Listens to baby_events over Supabase realtime (migration 0005). Every
//   change is re-announced as the EVENTS_CHANGED window event, so Today and
//   History refresh within a second of the other parent logging.
// - When the other parent logs something, a banner slides down from the
//   top: "Ysa logged a feed · 4 oz".
// - If both of you logged the same thing at nearly the same moment (both
//   tapped before either phone heard about the other), the banner says so
//   and offers to remove yours.
// - Coming back to the app re-announces too, since a phone in the
//   background can miss realtime messages.
// - Marks this phone's push subscription as belonging to whoever is signed
//   in, so partner alerts (supabase/functions/notify-log) skip the person
//   who logged.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { EVENTS_CHANGED, describeLog, findDoubleLog, parentName, whoLogged } from './logText';
import { confirmPushOwner } from './push';

const LogSyncContext = createContext({ email: null });
export const useLogSync = () => useContext(LogSyncContext);

const BANNER_MS = 6000;
const RECENT_KEEP_MS = 40 * 60 * 1000;
const TWIN_MS = 2 * 60 * 1000;

function announce(detail) {
  window.dispatchEvent(new CustomEvent(EVENTS_CHANGED, { detail }));
}

export function LogSyncProvider({ children }) {
  const [email, setEmail] = useState(null);
  const [banner, setBanner] = useState(null); // { who, action, detail, removeId }
  const [show, setShow] = useState(false);
  const hideRef = useRef(null);
  const recentRef = useRef([]); // inserts seen this session, newest last
  const pairedRef = useRef(new Set()); // ids already offered for removal

  // Who's signed in (null on the login screen, where nothing here runs).
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data?.session?.user?.email?.toLowerCase() || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email?.toLowerCase() || null);
    });
    return () => { alive = false; sub?.subscription?.unsubscribe(); };
  }, []);

  const showBanner = useCallback((next) => {
    clearTimeout(hideRef.current);
    setBanner(next);
    setShow(true);
    hideRef.current = setTimeout(() => setShow(false), next.removeId ? BANNER_MS + 4000 : BANNER_MS);
  }, []);

  useEffect(() => () => clearTimeout(hideRef.current), []);

  const onInsert = useCallback((row) => {
    const mine = Boolean(row.logged_by && row.logged_by === email);
    const now = Date.now();
    recentRef.current = recentRef.current.filter(r => now - new Date(r.event_time).getTime() < RECENT_KEEP_MS);

    // Same thing logged by the other phone moments apart (both tapped
    // before either phone heard about the other)? Only logs saved within
    // TWIN_MS of each other count, so a deliberate "Log anyway" after the
    // double-log check never gets second-guessed here.
    const savedAt = (r) => new Date(r.created_at || r.event_time).getTime();
    const others = recentRef.current.filter(r => r.logged_by && r.logged_by !== row.logged_by
      && Math.abs(savedAt(r) - savedAt(row)) < TWIN_MS);
    const twin = findDoubleLog(others, row, new Date(row.event_time).getTime());
    recentRef.current.push(row);

    if (twin && (mine || twin.logged_by === email)) {
      const myRow = mine ? row : twin;
      const theirRow = mine ? twin : row;
      // Only the parent who logged second is offered "Remove mine", so the
      // two phones can never both delete and leave nothing behind.
      if (Number(myRow.id) > Number(theirRow.id) && !pairedRef.current.has(myRow.id)) {
        pairedRef.current.add(myRow.id);
        const { action } = describeLog(theirRow);
        showBanner({
          who: parentName(theirRow.logged_by) || 'Someone',
          action: `also ${action}`,
          detail: 'Logged twice?',
          removeId: myRow.id,
        });
        return;
      }
    }

    if (!mine && row.logged_by) {
      const { action, detail } = describeLog(row);
      showBanner({ who: whoLogged(row.logged_by, email), action, detail });
    }
  }, [email, showBanner]);

  useEffect(() => {
    if (!email) return undefined;
    confirmPushOwner().catch(() => {});

    const channel = supabase
      .channel('baby-events-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_events' }, (payload) => {
        const row = payload.new && Object.keys(payload.new).length ? payload.new : null;
        const mine = Boolean(row?.logged_by && row.logged_by === email);
        if (payload.eventType === 'INSERT' && row) onInsert(row);
        announce({ source: 'realtime', eventType: payload.eventType, mine, row });
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') announce({ source: 'resume' });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [email, onInsert]);

  const removeMine = useCallback(async () => {
    const id = banner?.removeId;
    setShow(false);
    if (!id) return;
    const { error } = await supabase.from('baby_events').delete().eq('id', id);
    if (error) { console.error(error); return; }
    announce({ source: 'local', eventType: 'DELETE' });
  }, [banner]);

  return (
    <LogSyncContext.Provider value={{ email }}>
      {children}
      <div className={`partner-banner${show ? ' show' : ''}${banner?.removeId ? ' is-twin' : ''}`} role="status" aria-live="polite">
        {banner && (
          <>
            <span className="partner-avatar" aria-hidden="true">{banner.who.slice(0, 1)}</span>
            <span className="partner-text">
              <span className="partner-title">{banner.who} {banner.action}</span>
              {banner.detail && <span className="partner-detail">{banner.detail}</span>}
            </span>
            {banner.removeId ? (
              <button type="button" className="partner-action" onClick={removeMine}>Remove mine</button>
            ) : null}
            <button type="button" className="partner-close" aria-label="Dismiss" onClick={() => setShow(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
            </button>
          </>
        )}
      </div>
    </LogSyncContext.Provider>
  );
}
