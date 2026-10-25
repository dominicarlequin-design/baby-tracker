'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc } from '../../lib/logic';
import {
  formatLocalTime,
  formatRelative,
  formatHours,
  buildActivityGroups,
  activityDetailSuffix,
  activityDotClass,
  TYPE_LABELS,
} from '../../lib/homeUi';

const EVENT_TYPES = ['feed', 'diaper', 'nap_start', 'nap_end', 'medicine', 'sleep_start', 'sleep_end'];
const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Same fetch window as the Log screen; the activity list itself only shows
// the most recent RECENT_ACTIVITY_LIMIT events so the day-grouped list
// doesn't grow unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 60;

// Category chips at the top. "All" is the original timeline; the others
// filter to one kind and add a per-day total beside each day label.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'feed', label: 'Feeds' },
  { key: 'diaper', label: 'Diapers' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'medicine', label: 'Meds' },
];
const EMPTY_TEXT = {
  feed: 'No feeds in the last 30 days.',
  diaper: 'No diapers in the last 30 days.',
  sleep: 'No naps or night sleep in the last 30 days.',
  medicine: 'No medicine in the last 30 days.',
};

function categoryOf(item) {
  if (item.kind === 'nap') return 'sleep';
  if (item.type === 'feed') return 'feed';
  if (item.type === 'diaper') return 'diaper';
  if (item.type === 'medicine') return 'medicine';
  return 'sleep'; // nap_start / nap_end / sleep_start / sleep_end
}

const SLEEP_TYPES = ['nap_start', 'nap_end', 'sleep_start', 'sleep_end'];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One-line total shown beside each day label in a category view.
function daySummary(filter, items) {
  if (filter === 'feed') {
    const oz = items.reduce((sum, i) => sum + (i.raw.feed_ounces || 0), 0);
    return plural(items.length, 'feed', 'feeds') + (oz ? ` · ${oz} oz` : '');
  }
  if (filter === 'diaper') {
    const wet = items.filter(i => i.raw.diaper_detail === 'pee' || i.raw.diaper_detail === 'both').length;
    const dirty = items.filter(i => i.raw.diaper_detail === 'poop' || i.raw.diaper_detail === 'both').length;
    return `${plural(items.length, 'diaper', 'diapers')} · ${wet} wet · ${dirty} dirty`;
  }
  if (filter === 'sleep') {
    const naps = items.filter(i => i.kind === 'nap');
    const hours = naps.reduce((sum, i) => sum + (new Date(i.end) - new Date(i.start)) / 3600000, 0);
    return naps.length ? `${plural(naps.length, 'nap', 'naps')} · ${formatHours(hours)}` : '';
  }
  if (filter === 'medicine') return plural(items.length, 'dose', 'doses');
  return '';
}

export default function RecentPage() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState(null);
  const [toastShow, setToastShow] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState('');
  const [editFeedOunces, setEditFeedOunces] = useState('');
  const [editDiaperDetail, setEditDiaperDetail] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  const [filter, setFilter] = useState('all');
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

  // Keeps "5m ago"-style relative times on today's rows fresh while this
  // page is open, same as the Log screen.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => clearTimeout(toastTimeoutRef.current), []);

  const showToast = useCallback((message) => {
    clearTimeout(toastTimeoutRef.current);
    setToast({ message });
    setToastShow(true);
    toastTimeoutRef.current = setTimeout(() => setToastShow(false), 2200);
  }, []);

  const timezone = config?.timezone || 'America/New_York';
  // "All" keeps the original cap of recent events. A single category looks
  // back over the whole 30-day window (capped at the same number of rows),
  // so e.g. Meds isn't limited to whatever happened in the last day or two.
  const activityGroups = useMemo(() => {
    if (filter === 'all') return buildActivityGroups(events.slice(0, RECENT_ACTIVITY_LIMIT), timezone, now);
    let left = RECENT_ACTIVITY_LIMIT;
    const groups = [];
    // Sleep pairs nap start/end from sleep entries only, so a diaper or feed
    // logged mid-nap doesn't split one nap into two separate rows.
    const source = filter === 'sleep' ? events.filter(e => SLEEP_TYPES.includes(e.type)) : events;
    for (const g of buildActivityGroups(source, timezone, now)) {
      if (left <= 0) break;
      const items = g.items.filter(i => categoryOf(i) === filter).slice(0, left);
      if (!items.length) continue;
      left -= items.length;
      groups.push({ ...g, items, summary: daySummary(filter, items) });
    }
    return groups;
  }, [events, timezone, now, filter]);

  const openEdit = useCallback((event) => {
    if (typeof event.id !== 'number') return; // not yet reconciled with the server
    setEditingEvent(event);
    setEditType(event.type);
    setEditValue(isoToLocalDatetimeInputValue(event.event_time, config?.timezone || 'America/New_York'));
    setEditFeedOunces(event.feed_ounces != null ? String(event.feed_ounces) : '');
    setEditDiaperDetail(event.diaper_detail || '');
  }, [config]);

  const cancelEdit = useCallback(() => {
    setEditingEvent(null);
    setEditValue('');
    setEditType('');
    setEditFeedOunces('');
    setEditDiaperDetail('');
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingEvent || !editValue) return;
    const [datePart, timePart] = editValue.split('T');
    const iso = localDateTimeToUtc(datePart, timePart, config?.timezone || 'America/New_York').toISOString();
    setSavingEdit(true);
    try {
      // baby_events has a public RLS update policy, so this goes straight
      // through the anon client like the rest of this app.
      const { data: updated, error } = await supabase
        .from('baby_events')
        .update({
          event_time: iso,
          type: editType,
          feed_ounces: editType === 'feed' && editFeedOunces ? Number(editFeedOunces) : null,
          diaper_detail: editType === 'diaper' && editDiaperDetail ? editDiaperDetail : null,
        })
        .eq('id', editingEvent.id)
        .select()
        .single();
      if (error) throw error;
      setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      showToast('Entry updated');
      cancelEdit();
    } catch (err) {
      console.error(err);
      showToast('Failed to update — try again');
    } finally {
      setSavingEdit(false);
    }
  }, [editingEvent, editValue, editType, editFeedOunces, editDiaperDetail, config, cancelEdit, showToast]);

  const deleteEdit = useCallback(async () => {
    if (!editingEvent) return;
    setDeletingEdit(true);
    try {
      const { error } = await supabase.from('baby_events').delete().eq('id', editingEvent.id);
      if (error) throw error;
      setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
      showToast('Entry deleted');
      cancelEdit();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete — try again');
    } finally {
      setDeletingEdit(false);
    }
  }, [editingEvent, cancelEdit, showToast]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>History</h1>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div className="swipe-tabs history-tabs" role="group" aria-label="Show">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            className={`swipe-tab${f.key === filter ? ' is-on' : ''}`}
            aria-pressed={f.key === filter}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <div className="card">
          <div className="history">
            {activityGroups.length === 0 ? (
              <div className="info-item">{filter === 'all' ? 'Nothing logged yet.' : EMPTY_TEXT[filter]}</div>
            ) : (
              activityGroups.map(group => (
                <div key={group.dayStr} className="activity-group">
                  <div className="activity-day-label">
                    <span>{group.label}</span>
                    {group.summary && <span className="activity-day-summary">{group.summary}</span>}
                  </div>
                  {group.items.map(item => (
                    <button key={item.id} className="activity-item" onClick={() => openEdit(item.raw)}>
                      {item.kind === 'nap' ? (
                        <>
                          <span className="activity-type">
                            <span className={`activity-dot ${activityDotClass(item)}`} aria-hidden="true" />
                            Nap · {formatHours((new Date(item.end) - new Date(item.start)) / (1000 * 60 * 60))}
                          </span>
                          <span className="activity-time">
                            {formatLocalTime(item.start, timezone)} – {formatLocalTime(item.end, timezone)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="activity-type">
                            <span className={`activity-dot ${activityDotClass(item)}`} aria-hidden="true" />
                            {TYPE_LABELS[item.type] || item.type}{activityDetailSuffix(item.raw)}
                          </span>
                          <span className="activity-time">
                            {formatLocalTime(item.event_time, timezone)}
                            {group.label === 'Today' ? ` · ${formatRelative(item.event_time, now)}` : ''}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <span>{toast?.message}</span>
      </div>

      {editingEvent && (
        <div className="modal-overlay" onClick={cancelEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit entry</div>
            <select className="modal-select" value={editType} onChange={e => setEditType(e.target.value)}>
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            {editType === 'feed' && (
              <select className="modal-select" value={editFeedOunces} onChange={e => setEditFeedOunces(e.target.value)}>
                <option value="">No amount logged</option>
                {FEED_OUNCE_OPTIONS.map(oz => (
                  <option key={oz} value={oz}>{oz} oz</option>
                ))}
              </select>
            )}
            {editType === 'diaper' && (
              <select className="modal-select" value={editDiaperDetail} onChange={e => setEditDiaperDetail(e.target.value)}>
                <option value="">No detail logged</option>
                <option value="pee">Pee</option>
                <option value="poop">Poop</option>
                <option value="both">Both</option>
              </select>
            )}
            <input
              type="datetime-local"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={cancelEdit} disabled={savingEdit || deletingEdit}>Cancel</button>
              <button
                className={`modal-btn-confirm ${savingEdit ? 'is-loading' : ''}`}
                onClick={confirmEdit}
                disabled={savingEdit || deletingEdit}
              >
                {savingEdit && <span className="btn-spinner" />}
                Save
              </button>
            </div>
            <button className="modal-btn-delete" onClick={deleteEdit} disabled={savingEdit || deletingEdit}>
              {deletingEdit ? 'Deleting…' : 'Delete entry'}
            </button>
          </div>
        </div>
      )}

      <TabBar active="recent" />
    </div>
  );
}
