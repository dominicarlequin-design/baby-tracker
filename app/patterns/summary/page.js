'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { buildVisitSummary, VISIT_RANGES } from '../../../lib/visitSummary';
import { formatMinutesDuration, formatShortDate } from '../../../lib/patterns';
import { ageLine, BABY_NAME } from '../../../lib/homeUi';
import { dailyMilkTarget } from '../../../lib/milk';
import { REACTIONS } from '../../../lib/solids';

const NOTES_KEY = 'visit-notes';
const hrs = (h) => (h == null ? '—' : formatMinutesDuration(h * 60));
const num = (n, unit = '') => (n == null ? '—' : `${n}${unit}`);

export default function VisitSummaryPage() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 34 * 86400000).toISOString();
    const [cfg, ev, solids] = await Promise.all([
      supabase.from('baby_config').select('*').eq('id', 1).single(),
      supabase.from('baby_events').select('*').gte('event_time', since).order('event_time', { ascending: false }),
      supabase.from('baby_events').select('*').eq('type', 'solid').order('event_time', { ascending: false }).limit(500),
    ]);
    if (cfg.error) console.error(cfg.error);
    if (cfg.data) setConfig(cfg.data);
    const merged = new Map();
    for (const e of [...(ev.data || []), ...(solids.data || [])]) merged.set(e.id, e);
    setEvents([...merged.values()]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { setNotes(localStorage.getItem(NOTES_KEY) || ''); } catch (e) {}
  }, []);
  const saveNotes = (v) => {
    setNotes(v);
    try { localStorage.setItem(NOTES_KEY, v); } catch (e) {}
  };

  const now = useMemo(() => new Date(), []);
  const timezone = config?.timezone || 'America/New_York';
  const summary = useMemo(() => (config ? buildVisitSummary(events, config, days, now) : null), [config, events, days, now]);
  const goal = config ? dailyMilkTarget(config.weight_lbs) : null;

  return (
    <div className="wrap visit-page">
      <div className="header-row no-print">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Insights</Link>
          <h1>Visit summary</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      {loading || !summary ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          <div className="visit-controls no-print">
            <div className="swipe-ranges visit-ranges" role="group" aria-label="Range">
              <span className="swipe-range-thumb" style={{ transform: `translateX(${VISIT_RANGES.indexOf(days) * 100}%)` }} />
              {VISIT_RANGES.map(r => (
                <button key={r} type="button" className={`swipe-range${r === days ? ' is-on' : ''}`} aria-pressed={r === days} onClick={() => setDays(r)}>
                  {r}D
                </button>
              ))}
            </div>
            <button type="button" className="modal-btn-confirm form-save visit-print" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>

          <label className="form-label no-print" htmlFor="visit-notes">Questions or notes for the doctor</label>
          <textarea
            id="visit-notes"
            className="form-input visit-notes-input no-print"
            rows={3}
            placeholder="e.g. Is the teething rash normal? When to start more solids?"
            value={notes}
            onChange={e => saveNotes(e.target.value)}
          />

          <article className="visit-sheet" aria-label="Visit summary">
            <header className="visit-head">
              <h2>{BABY_NAME}: visit summary</h2>
              <div className="visit-head-sub">
                {summary.firstDay ? `${formatShortDate(summary.firstDay)} to ${formatShortDate(summary.lastDay)}` : 'No days yet'}
                {' · '}{summary.daysLogged} {summary.daysLogged === 1 ? 'day' : 'days'} with logs
              </div>
              <div className="visit-head-sub">
                {[
                  config.birth_date && ageLine(config.birth_date, now, timezone),
                  config.birth_date && `Born ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${config.birth_date}T12:00:00Z`))}`,
                  config.weight_lbs && `Weight ${config.weight_lbs} lbs (as entered by parents)`,
                ].filter(Boolean).join(' · ')}
              </div>
            </header>

            {summary.daysLogged === 0 ? (
              <p className="visit-empty">Nothing logged in this range yet.</p>
            ) : (
              <table className="visit-table">
                <thead><tr><th>Daily average</th><th>Value</th><th>Detail</th></tr></thead>
                <tbody>
                  <tr><td>Feeds</td><td>{num(summary.feeds.avg, ' / day')}</td><td>{summary.feeds.min != null ? `${summary.feeds.min} to ${summary.feeds.max} per day` : ''}</td></tr>
                  <tr><td>Milk logged</td><td>{summary.ounces.avg != null ? `${summary.ounces.avg} oz / day` : '—'}</td><td>{goal ? `Daily target ${goal.target} oz` : ''}{summary.ounces.days ? `${goal ? ' · ' : ''}from ${summary.ounces.days} days with amounts` : ''}</td></tr>
                  <tr><td>Diapers</td><td>{num(summary.diapers.avg, ' / day')}</td><td>{summary.diapers.wet != null ? `${summary.diapers.wet} wet · ${summary.diapers.dirty} dirty` : ''}</td></tr>
                  <tr><td>Sleep (total)</td><td>{hrs(summary.sleep.avgHours)}{' / day'}</td><td>{num(summary.sleep.napsPerDay, ' naps / day')}</td></tr>
                  <tr><td>Longest night stretch</td><td>{hrs(summary.night.longestAvgHours)}</td><td>{summary.night.longestMaxHours != null ? `Best night ${hrs(summary.night.longestMaxHours)}` : ''}</td></tr>
                  <tr><td>Wake window</td><td>{hrs(summary.wakeWindowHours)}</td><td>Between naps</td></tr>
                  <tr><td>Bedtime</td><td>{summary.bedtime || '—'}</td><td>Typical</td></tr>
                  <tr><td>Medicine</td><td>{summary.medicine.total} {summary.medicine.total === 1 ? 'dose' : 'doses'}</td><td>{summary.medicine.perDay != null ? `${summary.medicine.perDay} / day` : ''}</td></tr>
                </tbody>
              </table>
            )}

            {summary.solids.total > 0 && (
              <section className="visit-section">
                <h3>Solids</h3>
                <p>
                  {summary.solids.total} {summary.solids.total === 1 ? 'food' : 'foods'} tried so far.
                  {summary.solids.newInRange.length > 0 ? ' New in this range:' : ' None new in this range.'}
                </p>
                {summary.solids.newInRange.length > 0 && (
                  <ul className="visit-foods">
                    {summary.solids.newInRange.map(f => (
                      <li key={f.key}>
                        <strong>{f.name}</strong>
                        {` · first ${new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric' }).format(new Date(f.firstAt))}`}
                        {f.allergen ? ' · common allergen' : ''}
                        {` · ${f.reaction ? REACTIONS[f.reaction].split(' (')[0].toLowerCase() : 'no reaction logged'}`}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {summary.rows.length > 0 && (
              <section className="visit-section">
                <h3>Day by day</h3>
                <table className="visit-table visit-days">
                  <thead><tr><th>Date</th><th>Feeds</th><th>Oz</th><th>Diapers</th><th>Naps</th><th>Sleep</th></tr></thead>
                  <tbody>
                    {summary.rows.map(d => (
                      <tr key={d.date}>
                        <td>{formatShortDate(d.date)}</td>
                        <td>{d.feeds}</td>
                        <td>{d.feedOunces || '—'}</td>
                        <td>{d.diapers}</td>
                        <td>{d.naps}</td>
                        <td>{hrs(d.totalSleepMinutes / 60)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {notes.trim() && (
              <section className="visit-section">
                <h3>Questions and notes</h3>
                <p className="visit-notes-print">{notes}</p>
              </section>
            )}

            <footer className="visit-foot">
              Logged by parents in Bay Bee Tracker on {new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric' }).format(now)}. Today is left out because it is still in progress. Parent-recorded, not a medical record.
            </footer>
          </article>
        </>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
