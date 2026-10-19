'use client';

import { useEffect, useRef, useState } from 'react';
import { average, formatShortDate, formatHoursDecimal } from './patterns';

// One card, three metrics. Swipe sideways through the last 30 days; the
// 7D/14D/30D chips change how many days fit on screen. Today's bar is
// striped because the day isn't over, and it's left out of the average.

const oneDecimal = v => `${Math.round(v * 10) / 10}`;

const METRICS = [
  { key: 'feeds', label: 'Feeds', title: 'Feeds per day', unit: 'feeds', valueOf: d => d.feeds, fmt: oneDecimal },
  { key: 'sleep', label: 'Sleep', title: 'Total sleep per day', unit: 'of sleep', valueOf: d => d.totalSleepMinutes / 60, fmt: formatHoursDecimal },
  { key: 'diapers', label: 'Diapers', title: 'Diaper changes per day', unit: 'changes', valueOf: d => d.diapers, fmt: oneDecimal },
];

const RANGES = [7, 14, 30];
const BAR_SIZE = { 7: { width: 38, gap: 6 }, 14: { width: 16, gap: 6 }, 30: { width: 6, gap: 4 } };
const PLOT_HEIGHT = 150; // px, matches .swipe-plot
const TICK_HEIGHT = 20;  // px, .swipe-tick height + .swipe-col gap

function weekday(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function SwipeChart({ days }) {
  const [metricKey, setMetricKey] = useState('feeds');
  const [range, setRange] = useState(14);
  const [selected, setSelected] = useState(null);
  const trackRef = useRef(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Track the chart's visible width so exactly `range` days fill it.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start scrolled to today, and jump back there when the metric, range or width changes.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [metricKey, range, days.length, trackWidth]);

  const metric = METRICS.find(m => m.key === metricKey);
  const values = days.map(d => {
    const v = metric.valueOf(d);
    return Number.isFinite(v) ? v : 0;
  });
  const last = days.length - 1;
  const fullDays = values.slice(Math.max(0, last - range + 1), last);
  const avg = average(fullDays);
  const max = Math.max(1, ...values) * 1.1;
  const { gap } = BAR_SIZE[range];
  const width = trackWidth
    ? Math.max(4, (trackWidth - gap * (range - 1)) / range)
    : BAR_SIZE[range].width;
  const sel = selected != null && selected <= last ? selected : null;

  const value = sel != null ? metric.fmt(values[sel]) : avg != null ? metric.fmt(avg) : '—';
  const caption = sel != null
    ? `${formatShortDate(days[sel].date)}${sel === last ? ' · so far' : ''}`
    : `avg / day · last ${fullDays.length} full days`;

  const pickMetric = key => { setMetricKey(key); setSelected(null); };
  const pickRange = r => { setRange(r); setSelected(null); };

  return (
    <div className={`swipe-chart swipe-${metric.key}`}>
      <div className="swipe-tabs" role="group" aria-label="Chart">
        {METRICS.map(m => (
          <button
            key={m.key}
            type="button"
            className={`swipe-tab${m.key === metricKey ? ' is-on' : ''}`}
            aria-pressed={m.key === metricKey}
            onClick={() => pickMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="card swipe-card">
        <div className="chart-header swipe-header">
          <div className="section-title chart-title">{metric.title}</div>
          <div className="swipe-ranges" role="group" aria-label="Range">
            {RANGES.map(r => (
              <button
                key={r}
                type="button"
                className={`swipe-range${r === range ? ' is-on' : ''}`}
                aria-pressed={r === range}
                onClick={() => pickRange(r)}
              >
                {r}D
              </button>
            ))}
          </div>
        </div>

        <div className="swipe-readout" aria-live="polite">
          <span className="swipe-value">{value}</span>
          <span className="swipe-caption">{caption}</span>
        </div>

        <div className="swipe-track" ref={trackRef}>
          <div className="swipe-inner" style={{ gap }}>
            {avg != null && (
              <div className="swipe-avg" style={{ bottom: TICK_HEIGHT + (avg / max) * PLOT_HEIGHT }} />
            )}
            {days.map((d, i) => {
              const isToday = i === last;
              const isOn = sel === i;
              const isMonday = weekday(d.date) === 1;
              return (
                <div
                  key={d.date}
                  className="swipe-col"
                  style={{ width, scrollSnapAlign: isMonday ? 'start' : 'none' }}
                >
                  <div className="swipe-plot">
                    <button
                      type="button"
                      className={`swipe-bar${isToday ? ' is-today' : ''}${isOn ? ' is-on' : ''}`}
                      style={{
                        height: `${Math.max((values[i] / max) * 100, 3)}%`,
                        opacity: sel != null && !isOn ? 0.22 : 1,
                      }}
                      aria-pressed={isOn}
                      aria-label={`${formatShortDate(d.date)}: ${metric.fmt(values[i])} ${metric.unit}${isToday ? ' so far' : ''}`}
                      onClick={() => setSelected(isOn ? null : i)}
                    />
                  </div>
                  <div className="swipe-tick">
                    {isMonday ? formatShortDate(d.date) : isToday ? 'Today' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="chart-footer">
          <span>Swipe left for earlier weeks. Tap a bar to see that day.</span>
        </div>
      </div>
    </div>
  );
}
