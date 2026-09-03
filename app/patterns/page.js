'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { dailySummaries, bedtimeMinutesLocal, formatMinutesAsClock } from '../../lib/summaries';

// Two 14-day windows: the displayed window, and the one before it, so the
// headline and the "typical day" comparisons have something to compare
// against without a second round trip.
const WINDOW_DAYS = 14;
const FETCH_DAYS = 35;

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function formatMinutesDuration(minutes) {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function formatHoursDecimal(hours) {
  if (hours == null) return '—';
  return `${hours.toFixed(1)}h`;
}

function formatShortDate(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

// Most notable change over the window, in plain language. Headlines on the
// longest-night-stretch metric (the example the design review called out)
// with a supporting line about wake windows; says so plainly if there
// isn't enough history yet rather than inventing a trend from thin data.
function buildHeadline(priorWindow, recentWindow) {
  const priorStretches = priorWindow.map(d => d.longestNightStretchMinutes).filter(m => m > 0);
  const recentStretches = recentWindow.map(d => d.longestNightStretchMinutes).filter(m => m > 0);

  if (priorStretches.length < 3 || recentStretches.length < 3) {
    return {
      insufficient: true,
      headline: 'Not enough history yet',
      sub: 'Keep logging for a couple of weeks and a trend will show up here.',
    };
  }

  const priorAvg = average(priorStretches);
  const recentAvg = average(recentStretches);

  const priorWake = priorWindow.map(d => d.avgWakeWindowHours).filter(h => h != null);
  const recentWake = recentWindow.map(d => d.avgWakeWindowHours).filter(h => h != null);
  const priorWakeAvg = priorWake.length ? average(priorWake) : null;
  const recentWakeAvg = recentWake.length ? average(recentWake) : null;

  return {
    insufficient: false,
    headline: `Her longest night stretch went from ${formatMinutesDuration(priorAvg)} to ${formatMinutesDuration(recentAvg)} over two weeks`,
    sub: priorWakeAvg != null && recentWakeAvg != null
      ? `Wake windows ${recentWakeAvg >= priorWakeAvg ? 'stretched' : 'shortened'} from ${formatHoursDecimal(priorWakeAvg)} to ${formatHoursDecimal(recentWakeAvg)} on average.`
      : 'Not enough nap data yet to compare wake windows.',
  };
}

function BarChart({ title, color, days, valueOf, formatValue }) {
  const values = days.map(valueOf);
  const max = Math.max(1, ...values.map(v => v || 0));
  const avg = average(values.filter(v => v != null));

  return (
    <div className="card">
      <div className="chart-header">
        <div className="section-title chart-title">{title}</div>
        <div className="chart-avg">avg {formatValue(avg)}</div>
      </div>
      <div className="bars">
        {days.map((d, i) => (
          <div
            key={d.date}
            className="bar"
            style={{ height: `${max ? ((values[i] || 0) / max) * 100 : 0}%`, background: color }}
            title={`${d.date}: ${formatValue(values[i])}`}
          />
        ))}
      </div>
      <div className="chart-footer">
        <span>{formatShortDate(days[0].date)}</span>
        <span>{formatShortDate(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

function exportCsv(days) {
  const headers = [
    'date', 'feeds', 'diapers', 'naps', 'napMinutes', 'nightSleepMinutes',
    'totalSleepMinutes', 'longestNightStretchMinutes', 'avgWakeWindowHours', 'avgFeedGapHours',
    'avgDiaperGapHours', 'bedtime',
  ];
  const rows = days.map(d => headers.map(h => d[h] ?? '').join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `baby-tracker-${days[0].date}-to-${days[days.length - 1].date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PatternsPage() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - FETCH_DAYS * 24 * 60 * 60 * 1000).toISOString();
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

  const timezone = config?.timezone || 'America/New_York';

  const { recentWindow, priorWindow } = useMemo(() => {
    if (!config) return { recentWindow: [], priorWindow: [] };
    const all = dailySummaries(events, config, FETCH_DAYS);
    return {
      recentWindow: all.slice(-WINDOW_DAYS),
      priorWindow: all.slice(-WINDOW_DAYS * 2, -WINDOW_DAYS),
    };
  }, [events, config]);

  const headline = useMemo(
    () => (recentWindow.length ? buildHeadline(priorWindow, recentWindow) : null),
    [priorWindow, recentWindow]
  );

  const typicalDay = useMemo(() => {
    if (recentWindow.length < WINDOW_DAYS) return null;

    const napsCount = average(recentWindow.map(d => d.naps));
    const napsMinutes = average(recentWindow.map(d => d.napMinutes));

    // "Current" wake window: the most recent 7 days of the displayed window.
    // "Two weeks ago": the 7-day span immediately before the displayed
    // window — as close to "exactly two weeks back" as daily-summary
    // granularity allows.
    const currentWake = average(recentWindow.slice(7).map(d => d.avgWakeWindowHours).filter(h => h != null));
    const twoWeeksAgoWake = average(priorWindow.slice(7).map(d => d.avgWakeWindowHours).filter(h => h != null));

    const bedtimeMinutes = recentWindow
      .filter(d => d.bedtime)
      .map(d => bedtimeMinutesLocal(d.bedtime, timezone));
    const bedtimeMean = average(bedtimeMinutes);
    const bedtimeSpread = bedtimeMean != null
      ? Math.sqrt(average(bedtimeMinutes.map(m => (m - bedtimeMean) ** 2)))
      : null;

    const feedGaps = recentWindow.map(d => d.avgFeedGapHours).filter(h => h != null);
    const feedGapMean = average(feedGaps);
    const feedGapMin = feedGaps.length ? Math.min(...feedGaps) : null;
    const feedGapMax = feedGaps.length ? Math.max(...feedGaps) : null;

    const diaperGaps = recentWindow.map(d => d.avgDiaperGapHours).filter(h => h != null);
    const diaperGapMean = average(diaperGaps);
    const diaperGapMin = diaperGaps.length ? Math.min(...diaperGaps) : null;
    const diaperGapMax = diaperGaps.length ? Math.max(...diaperGaps) : null;

    return {
      napsCount, napsMinutes, currentWake, twoWeeksAgoWake, bedtimeMean, bedtimeSpread,
      feedGapMean, feedGapMin, feedGapMax, diaperGapMean, diaperGapMin, diaperGapMax,
    };
  }, [recentWindow, priorWindow, timezone]);

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Patterns</h1>
        <Link href="/settings" className="header-settings-link">Settings</Link>
      </div>

      {loading || !config ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          {headline && (
            <div className={`nextup ${headline.insufficient ? '' : 'nextup-headline-card'}`}>
              <div className="nextup-headline">{headline.headline}</div>
              <div className="nextup-sub">{headline.sub}</div>
            </div>
          )}

          {recentWindow.length > 0 && (
            <>
              <BarChart
                title="Feeds per day"
                color="var(--accent)"
                days={recentWindow}
                valueOf={d => d.feeds}
                formatValue={v => (v == null ? '—' : `${v.toFixed(1)}/day`)}
              />
              <BarChart
                title="Total sleep per day"
                color="var(--berry-deep)"
                days={recentWindow}
                valueOf={d => d.totalSleepMinutes / 60}
                formatValue={v => (v == null ? '—' : `${v.toFixed(1)}h/day`)}
              />
              <BarChart
                title="Diaper changes per day"
                color="var(--orchid)"
                days={recentWindow}
                valueOf={d => d.diapers}
                formatValue={v => (v == null ? '—' : `${v.toFixed(1)}/day`)}
              />
            </>
          )}

          {typicalDay && (
            <div className="card">
              <div className="section-title">Typical day (last two weeks)</div>
              <div className="table-row">
                <span className="table-label">Naps</span>
                <span className="table-value">{typicalDay.napsCount.toFixed(1)} · {formatMinutesDuration(typicalDay.napsMinutes)} total</span>
              </div>
              <div className="table-row">
                <span className="table-label">Wake window</span>
                <span className="table-value">
                  {formatHoursDecimal(typicalDay.currentWake)}
                  {typicalDay.twoWeeksAgoWake != null && ` (was ${formatHoursDecimal(typicalDay.twoWeeksAgoWake)})`}
                </span>
              </div>
              <div className="table-row">
                <span className="table-label">Bedtime</span>
                <span className="table-value">
                  {typicalDay.bedtimeMean != null
                    ? `${formatMinutesAsClock(typicalDay.bedtimeMean)} ± ${Math.round(typicalDay.bedtimeSpread)}m`
                    : '—'}
                </span>
              </div>
              <div className="table-row">
                <span className="table-label">Feed gap</span>
                <span className="table-value">
                  {typicalDay.feedGapMean != null
                    ? `${formatHoursDecimal(typicalDay.feedGapMean)} (${typicalDay.feedGapMin.toFixed(1)}–${typicalDay.feedGapMax.toFixed(1)}h)`
                    : '—'}
                </span>
              </div>
              <div className="table-row">
                <span className="table-label">Diaper gap</span>
                <span className="table-value">
                  {typicalDay.diaperGapMean != null
                    ? `${formatHoursDecimal(typicalDay.diaperGapMean)} (${typicalDay.diaperGapMin.toFixed(1)}–${typicalDay.diaperGapMax.toFixed(1)}h)`
                    : '—'}
                </span>
              </div>
            </div>
          )}

          {recentWindow.length > 0 && (
            <button className="export-btn" onClick={() => exportCsv(recentWindow)}>
              Export two weeks for the pediatrician
            </button>
          )}
        </>
      )}

      <nav className="tab-bar">
        <Link href="/" className="tab-item">Log</Link>
        <span className="tab-item tab-active">Patterns</span>
      </nav>
    </div>
  );
}
