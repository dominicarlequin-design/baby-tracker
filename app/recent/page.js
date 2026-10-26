'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { EVENTS_CHANGED } from '../../lib/QuickLogSheet';
import { parentName } from '../../lib/logText';
import { isoToLocalDatetimeInputValue, localDateTimeToUtc, localDateStr } from '../../lib/logic';
import { dailySummaries } from '../../lib/summaries';
import { dailyMilkTarget } from '../../lib/milk';
import {
  formatLocalTime,
  formatRelative,
  formatHours,
  buildActivityGroups,
  activityTitle,
  activityDotClass,
  TYPE_LABELS,
  TileIcon,
} from '../../lib/homeUi';

const EVENT_TYPES = ['feed', 'diaper', 'nap_start', 'nap_end', 'medicine', 'sleep_start', 'sleep_end', 'custom'];
const FEED_OUNCE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Same fetch window as the Log screen; the activity list itself only shows
// the most recent RECENT_ACTIVITY_LIMIT events so the day-grouped list
// doesn't grow unbounded as baby_events accumulates.
const HISTORY_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 60;

// History opens as a short stack of category buttons. Tapping one drops
// down that category's history underneath it (one open at a time).
const CATEGORIES = [
  { key: 'feed', label: 'Feeds', icon: 'feed', none: 'No feeds yet today' },
  { key: 'diaper', label: 'Diapers', icon: 'diaper', none: 'No diapers yet today' },
  { key: 'sleep', label: 'Sleep', icon: 'sleep', none: 'No naps yet today' },
  { key: 'medicine', label: 'Medicine', icon: 'medicine', none: 'No medicine yet today' },
  { key: 'custom', label: 'Custom', icon: 'custom', none: 'Nothing custom yet today' },
  { key: 'all', label: 'All activity', icon: null, none: 'Nothing logged yet today' },
];
const EMPTY_TEXT = {
  all: 'Nothing logged in the last 30 days.',
  feed: 'No feeds in the last 30 days.',
  diaper: 'No diapers in the last 30 days.',
  sleep: 'No naps or night sleep in the last 30 days.',
  medicine: 'No medicine in the last 30 days.',
  custom: 'Nothing custom logged in the last 30 days.',
};

function categoryOf(item) {
  if (item.kind === 'nap') return 'sleep';
  if (item.type === 'feed') return 'feed';
  if (item.type === 'diaper') return 'diaper';
  if (item.type === 'medicine') return 'medicine';
  if (item.type === 'custom') return 'custom';
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
  if (filter === 'custom') return plural(items.length, 'entry', 'entries');
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
  const [editCustomLabel, setEditCustomLabel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  const [openKey, setOpenKey] = useState(null);
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

  // Refresh when something is logged or undone from the center + sheet.
  useEffect(() => {
    window.addEventListener(EVENTS_CHANGED, fetchAll);
    return () => window.removeEventListener(EVENTS_CHANGED, fetchAll);
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
  // Day-grouped history for each category. "All" keeps the original cap of
  // recent events; a single category looks back over the whole 30-day
  // window (capped at the same number of rows).
  const groupsByCategory = useMemo(() => {
    const out = { all: buildActivityGroups(events.slice(0, RECENT_ACTIVITY_LIMIT), timezone, now) };
    for (const { key } of CATEGORIES) {
      if (key === 'all') continue;
      let left = RECENT_ACTIVITY_LIMIT;
      const groups = [];
      // Sleep pairs nap start/end from sleep entries only, so a diaper or
      // feed logged mid-nap doesn't split one nap into two separate rows.
      const source = key === 'sleep' ? events.filter(e => SLEEP_TYPES.includes(e.type)) : events;
      for (const g of buildActivityGroups(source, timezone, now)) {
        if (left <= 0) break;
        const items = g.items.filter(i => categoryOf(i) === key).slice(0, left);
        if (!items.length) continue;
        left -= items.length;
        groups.push({ ...g, items, summary: daySummary(key, items) });
      }
      out[key] = groups;
    }
    return out;
  }, [events, timezone, now]);

  // Today's line under each category button, kept short enough to fit on
  // one line ("4 today · 3 wet · 2 dirty").
  const todayLine = (cat) => {
    const groups = groupsByCategory[cat.key] || [];
    const today = groups[0]?.label === 'Today' ? groups[0] : null;
    if (!today) return cat.none;
    const items = today.items;
    if (cat.key === 'feed') {
      const oz = items.reduce((sum, i) => sum + (i.raw.feed_ounces || 0), 0);
      return `${items.length} today` + (oz ? ` · ${oz} oz` : '');
    }
    if (cat.key === 'diaper') {
      const wet = items.filter(i => i.raw.diaper_detail === 'pee' || i.raw.diaper_detail === 'both').length;
      const dirty = items.filter(i => i.raw.diaper_detail === 'poop' || i.raw.diaper_detail === 'both').length;
      return `${items.length} today · ${wet} wet · ${dirty} dirty`;
    }
    if (cat.key === 'sleep') {
      const naps = items.filter(i => i.kind === 'nap');
      if (!naps.length) return cat.none;
      const hours = naps.reduce((sum, i) => sum + (new Date(i.end) - new Date(i.start)) / 3600000, 0);
      return `${plural(naps.length, 'nap', 'naps')} today · ${formatHours(hours)}`;
    }
    if (cat.key === 'medicine') return `${plural(items.length, 'dose', 'doses')} today`;
    if (cat.key === 'custom') {
      const labels = [...new Set(items.map(i => i.raw.custom_label).filter(Boolean))];
      return `${items.length} today · ${labels.join(', ')}`;
    }
    return `${plural(items.length, 'entry', 'entries')} today`;
  };

  // Today's stats (moved here from the sheet behind Today's title): feeds
  // with ounces against the daily milk goal, diapers wet/dirty, sleep.
  const todayStats = useMemo(() => {
    if (!config) return null;
    const summary = dailySummaries(events, config, 1)[0];
    if (!summary) return null;
    const todayKey = localDateStr(now, timezone);
    let ounces = 0;
    let wet = 0;
    let dirty = 0;
    for (const e of events) {
      if (localDateStr(new Date(e.event_time), timezone) !== todayKey) continue;
      if (e.type === 'feed' && typeof e.feed_ounces === 'number') ounces += e.feed_ounces;
      else if (e.type === 'diaper') {
        if (e.diaper_detail === 'pee' || e.diaper_detail === 'both') wet++;
        if (e.diaper_detail === 'poop' || e.diaper_detail === 'both') dirty++;
      }
    }
    const goal = dailyMilkTarget(config.weight_lbs);
    return { ...summary, ounces, wet, dirty, target: goal?.target ?? null };
  }, [events, config, now, timezone]);

  const openEdit = useCallback((event) => {
    if (typeof event.id !== 'number') return; // not yet reconciled with the server
    setEditingEvent(event);
    setEditType(event.type);
    setEditValue(isoToLocalDatetimeInputValue(event.event_time, config?.timezone || 'America/New_York'));
    setEditFeedOunces(event.feed_ounces != null ? String(event.feed_ounces) : '');
    setEditDiaperDetail(event.diaper_detail || '');
    setEditCustomLabel(event.custom_label || '');
  }, [config]);

  const cancelEdit = useCallback(() => {
    setEditingEvent(null);
    setEditValue('');
    setEditType('');
    setEditFeedOunces('');
    setEditDiaperDetail('');
    setEditCustomLabel('');
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingEvent || !editValue) return;
    const customLabel = editCustomLabel.trim().replace(/\s+/g, ' ');
    if (editType === 'custom' && !customLabel) {
      showToast('Give the custom entry a label');
      return;
    }
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
          custom_label: editType === 'custom' ? customLabel.slice(0, 60) : null,
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
  }, [editingEvent, editValue, editType, editFeedOunces, editDiaperDetail, editCustomLabel, config, cancelEdit, showToast]);

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

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
        {todayStats && (
          <section className="history-stats" aria-label="Today's stats">
            <h2 className="history-stats-title">Today&apos;s stats</h2>
            <div className="stats-row">
              <div className="stat-tile stat-tile-feed">
                <div className="stat-tile-row">
                  <TileIcon name="feed" />
                  <div className="stat-tile-text">
                    <div className="stat-value">{todayStats.feeds}</div>
                    <div className="stat-label">Feeds</div>
                  </div>
                </div>
                <div className="stat-sub">
                  {todayStats.target ? `${todayStats.ounces} / ${todayStats.target} oz` : `Total: ${todayStats.ounces} oz`}
                </div>
              </div>
              <div className="stat-tile stat-tile-diaper">
                <div className="stat-tile-row">
                  <TileIcon name="diaper" />
                  <div className="stat-tile-text">
                    <div className="stat-value">{todayStats.diapers}</div>
                    <div className="stat-label">Diapers</div>
                  </div>
                </div>
                <div className="stat-sub">{todayStats.wet} Wet &middot; {todayStats.dirty} Dirty</div>
              </div>
              <div className="stat-tile stat-tile-nap">
                <div className="stat-tile-row">
                  <TileIcon name="sleep" />
                  <div className="stat-tile-text">
                    <div className="stat-value">{formatHours(todayStats.napMinutes / 60) || '0m'}</div>
                    <div className="stat-label">Sleep</div>
                  </div>
                </div>
                <div className="stat-sub">{plural(todayStats.naps, 'nap', 'naps')}</div>
              </div>
            </div>
          </section>
        )}
        <div className="history-cats">
          {CATEGORIES.map(cat => {
            const open = openKey === cat.key;
            const groups = groupsByCategory[cat.key] || [];
            return (
              <div key={cat.key} className={`history-cat${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="history-cat-head"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open ? null : cat.key)}
                >
                  {cat.icon ? (
                    <TileIcon name={cat.icon} />
                  ) : (
                    <span className="tile-icon history-cat-all-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></svg>
                    </span>
                  )}
                  <span className="history-cat-text">
                    <span className="history-cat-label">{cat.label}</span>
                    <span className="history-cat-sub">{todayLine(cat)}</span>
                  </span>
                  <svg className="history-cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {open && (
                  <div className="history history-cat-body">
                    {groups.length === 0 ? (
                      <div className="info-item">{EMPTY_TEXT[cat.key]}</div>
                    ) : (
                      groups.map(group => (
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
                                    {activityTitle(item.raw)}
                                  </span>
                                  <span className="activity-time">
                                    {formatLocalTime(item.event_time, timezone)}
                                    {group.label === 'Today' ? ` · ${formatRelative(item.event_time, now)}` : ''}
                                    {parentName(item.raw?.logged_by) ? ` · ${parentName(item.raw.logged_by)}` : ''}
                                  </span>
                                </>
                              )}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
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
            {editType === 'custom' && (
              <input
                className="form-input modal-select"
                type="text"
                maxLength={60}
                placeholder="What was it? e.g. Vitamin D"
                value={editCustomLabel}
                onChange={e => setEditCustomLabel(e.target.value)}
              />
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
