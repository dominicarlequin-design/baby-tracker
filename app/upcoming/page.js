'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { computeStatus } from '../../lib/logic';
import { bedtimePattern } from '../../lib/summaries';
import { formatLocalTime, nextMedicineSlot, explainStatus, MoreRow, NightSleepRow } from '../../lib/homeUi';

// Same window as the Log screen — enough history for the rolling averages
// and the 14-night bedtime pattern without growing unbounded.
const HISTORY_DAYS = 30;

export default function UpcomingPage() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [explainKey, setExplainKey] = useState(null);
  const [bedtimePatternOpen, setBedtimePatternOpen] = useState(false);

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

  // Keeps "due soon"/"overdue" and asleep-duration text fresh while this
  // page is open, same as the Log screen.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10 * 1000);
    return () => clearInterval(t);
  }, []);

  const status = useMemo(() => (config ? computeStatus(events, config, now) : null), [events, config, now]);
  const timezone = config?.timezone || 'America/New_York';

  // Historical bedtime pattern (last 14 nights), shown in a dropdown under
  // the Night sleep row alongside — not instead of — the Target-bedtime
  // due/overdue judgment that already drives status.sleep.
  const bedtimeInfo = useMemo(() => (config ? bedtimePattern(events, config, now, 14) : null), [events, config, now]);
  const medicineNext = config ? nextMedicineSlot(config, now) : null;

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Upcoming</h1>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
      </div>

      {loading || !status ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <div className="card">
          <MoreRow label="Feed" status={status.feed} timezone={timezone} statusKey="feed" onExplain={setExplainKey} />
          <MoreRow label="Diaper" status={status.diaper} timezone={timezone} statusKey="diaper" onExplain={setExplainKey} />
          <MoreRow label="Nap" status={status.nap} timezone={timezone} asleepLabel="Napping" statusKey="nap" onExplain={setExplainKey} />
          <NightSleepRow
            status={status.sleep}
            timezone={timezone}
            pattern={bedtimeInfo}
            patternOpen={bedtimePatternOpen}
            onTogglePattern={() => setBedtimePatternOpen(o => !o)}
            onExplain={setExplainKey}
          />
          <div className="status-row">
            <div>
              <div className="status-label">
                Medicine
                <button type="button" className="why-btn" onClick={() => setExplainKey('medicine')} aria-label="Why Medicine?">Why?</button>
              </div>
              {status.medicine.overdue && <div className="status-detail">Overdue</div>}
            </div>
            <span className={`more-detail ${status.medicine.overdue ? 'overdue' : 'muted'}`}>
              {medicineNext ? formatLocalTime(medicineNext.toISOString(), timezone) : 'No schedule set'}
            </span>
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

      <TabBar active="upcoming" />
    </div>
  );
}
