'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { computeStatus, isoToLocalDatetimeInputValue, localDateTimeToUtc } from '../lib/logic';

const LOG_BUTTONS = [
  { type: 'feed', label: 'Fed', cls: 'btn-feed' },
  { type: 'nap_start', label: 'Nap Start', cls: 'btn-nap-start' },
  { type: 'nap_end', label: 'Nap End', cls: 'btn-nap-end' },
  { type: 'diaper', label: 'Diaper', cls: 'btn-diaper' },
  { type: 'medicine', label: 'Medicine', cls: 'btn-medicine' },
  { type: 'sleep_start', label: 'Bedtime', cls: 'btn-sleep-start' },
  { type: 'sleep_end', label: 'Wake Up', cls: 'btn-sleep-end' },
];

const TYPE_LABELS = {
  feed: 'Fed',
  nap_start: 'Nap started',
  nap_end: 'Nap ended',
  diaper: 'Diaper',
  medicine: 'Medicine',
  sleep_start: 'Bedtime',
  sleep_end: 'Wake up',
};

const RECENT_LIMIT = 20;
// Bounds how much history is fetched/rescanned on every load and 60s tick.
// 30 days of events comfortably covers rolling-average sample windows and
// the medicine schedule's today/yesterday lookback, without growing
// unbounded as baby_events accumulates over months of use.
const HISTORY_DAYS = 30;

function formatLocalTime(iso, timezone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

function formatLocalDateTime(iso, timezone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

function formatHours(h) {
  if (h == null) return null;
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

export default function Page() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [now, setNow] = useState(() => new Date());

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

  // keep "time since" displays fresh without needing a full refetch
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2200);
  }, []);

  const logEvent = useCallback(async (type, label) => {
    const { error } = await supabase.from('baby_events').insert({ type, event_time: new Date().toISOString() });
    if (error) {
      console.error(error);
      showToast('Failed to log — try again');
      return;
    }
    showToast(`Logged: ${label}`);
    fetchAll();
  }, [fetchAll, showToast]);

  const openEdit = useCallback((event) => {
    setEditingEvent(event);
    setEditValue(isoToLocalDatetimeInputValue(event.event_time, config?.timezone || 'America/New_York'));
  }, [config]);

  const cancelEdit = useCallback(() => {
    setEditingEvent(null);
    setEditValue('');
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingEvent || !editValue) return;
    const [datePart, timePart] = editValue.split('T');
    const iso = localDateTimeToUtc(datePart, timePart, config?.timezone || 'America/New_York').toISOString();
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_time: iso }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Time updated');
      cancelEdit();
      fetchAll();
    } catch (err) {
      console.error(err);
      showToast('Failed to update — try again');
    }
  }, [editingEvent, editValue, config, cancelEdit, fetchAll, showToast]);

  const status = useMemo(() => {
    if (!config) return null;
    return computeStatus(events, config, now);
  }, [events, config, now]);

  const timezone = config?.timezone || 'America/New_York';
  const recent = events.slice(0, RECENT_LIMIT);

  return (
    <div className="wrap">
      <h1>Baby Tracker</h1>
      <div className="subtitle">Tap to log. Alerts push to your phone automatically.</div>

      <div className="card">
        <div className="section-title">Log an event</div>
        <div className="btn-grid">
          {LOG_BUTTONS.map(b => (
            <button
              key={b.type}
              className={`log-btn ${b.cls}`}
              onClick={() => logEvent(b.type, b.label)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Status</div>
        {loading || !status ? (
          <div className="info-item">Loading…</div>
        ) : (
          <>
            <StatusRow
              label="Feed"
              overdue={status.feed.overdue}
              detail={
                status.feed.lastEventTime
                  ? `Last fed ${formatHours(status.feed.hoursSince)} ago · usually every ${formatHours(status.feed.avgHours)}`
                  : 'No feeds logged yet'
              }
            />
            <StatusRow
              label="Diaper"
              overdue={status.diaper.overdue}
              detail={
                status.diaper.lastEventTime
                  ? `Last change ${formatHours(status.diaper.hoursSince)} ago · usually every ${formatHours(status.diaper.avgHours)}`
                  : 'No diaper changes logged yet'
              }
            />
            <StatusRow
              label="Nap"
              overdue={status.nap.overdue}
              pillOverride={status.nap.asleep ? 'Napping' : null}
              detail={
                status.nap.asleep
                  ? `Since ${formatLocalTime(status.nap.lastEventTime, timezone)}`
                  : status.nap.lastEventTime
                    ? `Awake ${formatHours(status.nap.hoursSince)} · usual wake window ${formatHours(status.nap.avgHours)}`
                    : 'No naps logged yet'
              }
            />
            <StatusRow
              label="Night sleep"
              overdue={status.sleep.overdue}
              pillOverride={status.sleep.asleep ? 'Sleeping' : null}
              detail={
                status.sleep.asleep
                  ? `Since ${formatLocalTime(status.sleep.lastEventTime, timezone)}`
                  : status.sleep.lastEventTime
                    ? `Awake ${formatHours(status.sleep.hoursSince)} · usual wake window ${formatHours(status.sleep.avgHours)}`
                    : 'No night sleep logged yet'
              }
            />
            <StatusRow
              label="Medicine"
              overdue={status.medicine.overdue}
              detail={
                status.medicine.lastScheduledSlot
                  ? `Last dose window ${formatLocalTime(status.medicine.lastScheduledSlot, timezone)}`
                  : 'No doses scheduled yet today'
              }
            />
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">Recent activity</div>
        <div className="history">
          {recent.length === 0 ? (
            <div className="info-item">Nothing logged yet.</div>
          ) : (
            recent.map(e => (
              <button key={e.id} className="activity-item" onClick={() => openEdit(e)}>
                <span className="activity-type">{TYPE_LABELS[e.type] || e.type}</span>
                <span className="activity-time">{formatLocalDateTime(e.event_time, timezone)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={`toast ${toastShow ? 'show' : ''}`}>{toast}</div>

      {editingEvent && (
        <div className="modal-overlay" onClick={cancelEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit {TYPE_LABELS[editingEvent.type] || editingEvent.type} time</div>
            <input
              type="datetime-local"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={cancelEdit}>Cancel</button>
              <button className="modal-btn-confirm" onClick={confirmEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, overdue, detail, pillOverride }) {
  const pillText = pillOverride || (overdue ? 'Overdue' : 'All clear');
  const pillClass = pillOverride ? 'ok' : (overdue ? 'overdue' : 'ok');
  return (
    <div className="status-row">
      <div>
        <div className="status-label">{label}</div>
        <div className="status-detail">{detail}</div>
      </div>
      <span className={`status-pill ${pillClass}`}>{pillText}</span>
    </div>
  );
}
