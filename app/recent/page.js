'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc } from '../../lib/logic';
import {
  formatLocalTime,
  formatDurationWords,
  formatRelative,
  buildActivityGroups,
  activityDetailSuffix,
  TYPE_LABELS,
} from '../../lib/homeUi';

const EVENT_TYPES = ['feed', 'diaper', 'nap_start', 'nap_end', 'medicine', 'sleep_start', 'sleep_end'];
const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Same fetch window as the Log screen; the activity list itself only shows
// the most recent RECENT_ACTIVITY_LIMIT events so the day-grouped list
// doesn't grow unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 60;

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
  const activityGroups = useMemo(
    () => buildActivityGroups(events.slice(0, RECENT_ACTIVITY_LIMIT), timezone, now),
    [events, timezone, now]
  );

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
        <h1>Recent activity</h1>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <div className="card">
          <div className="history">
            {activityGroups.length === 0 ? (
              <div className="info-item">Nothing logged yet.</div>
            ) : (
              activityGroups.map(group => (
                <div key={group.dayStr} className="activity-group">
                  <div className="activity-day-label">{group.label}</div>
                  {group.items.map(item => (
                    <button key={item.id} className="activity-item" onClick={() => openEdit(item.raw)}>
                      {item.kind === 'nap' ? (
                        <>
                          <span className="activity-type">
                            Nap · {formatDurationWords((new Date(item.end) - new Date(item.start)) / (1000 * 60 * 60))}
                          </span>
                          <span className="activity-time">
                            {formatLocalTime(item.start, timezone)} – {formatLocalTime(item.end, timezone)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="activity-type">{TYPE_LABELS[item.type] || item.type}{activityDetailSuffix(item.raw)}</span>
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
