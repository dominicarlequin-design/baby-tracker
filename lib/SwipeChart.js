'use client';

import { useEffect, useRef, useState } from 'react';
import { average, formatShortDate, formatHoursDecimal } from './patterns';
import { milkStatus, milkStatusText } from './milk';

// One card, three metrics. Swipe sideways through the last 30 days; the
// 7D/14D/30D chips change how many days fit on screen. Today's bar is
// striped because the day isn't over, and it's left out of the average.

const oneDecimal = v => `${Math.round(v * 10) / 10}`;

const METRICS = [
  { key: 'feeds', label: 'Feeds', title: 'Feeds per day', unit: 'feeds', valueOf: d => d.feeds, fmt: oneDecimal },
  { key: 'sleep', label: 'Sleep', title: 'Total sleep per day', unit: 'of sleep', valueOf: d => d.totalSleepMinutes / 60, fmt: formatHoursDecimal },
  { key: 'diapers', label: 'Diapers', title: 'Diaper changes per day', unit: 'changes', valueOf: d => d.diapers, fmt: oneDecimal },
  // Milk: daily ounces, each bar colored pink / green / amber against her
  // daily target (lib/milk.js), with a dotted line at the target.
  { key: 'milk', label: 'Milk', title: 'Milk per day', unit: '', valueOf: d => d.feedOunces, fmt: v => `${Math.round(v)} oz` },
];

const RANGES = [7, 14, 30];
const BAR_SIZE = { 7: { width: 38, gap: 6 }, 14: { width: 16, gap: 6 }, 30: { width: 6, gap: 4 } };
const PLOT_HEIGHT = 150; // px, matches .swipe-plot
const TICK_HEIGHT = 20;  // px, .swipe-tick height + .swipe-col gap
const LABEL_ROOM = 48;   // px a week label needs before Today's label so they don't collide

function weekday(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

// `milkGoal` is dailyMilkTarget()'s result ({ target, capped }) or null
// when no weight is set; without it the Milk tab still shows daily ounces,
// just in one color with the usual average line.
export function SwipeChart({ days, milkGoal = null }) {
  const [metricKey, setMetricKey] = useState('feeds');
  const [range, setRange] = useState(14);
  const [selected, setSelected] = useState(null);
  const trackRef = useRef(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrollPos, setScrollPos] = useState(0);

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
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setScrollPos(el.scrollLeft);
  }, [metricKey, range, days.length, trackWidth]);

  // Where the chart is scrolled to, so week labels only show while their
  // own bar is on screen (a label from a week scrolled off the left edge
  // would otherwise peek in as a stray "12").
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrollPos(el.scrollLeft));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);

  const metric = METRICS.find(m => m.key === metricKey);
  const values = days.map(d => {
    const v = metric.valueOf(d);
    return Number.isFinite(v) ? v : 0;
  });
  const last = days.length - 1;
  const fullDays = values.slice(Math.max(0, last - range + 1), last);
  const avg = average(fullDays);
  const isMilk = metric.key === 'milk';
  const target = isMilk && milkGoal ? milkGoal.target : null;
  const max = Math.max(1, ...values, target ?? 0) * 1.1;
  const statusOf = i => (target ? milkStatus(values[i], target) : null);
  const { gap } = BAR_SIZE[range];
  const width = trackWidth
    ? Math.max(4, (trackWidth - gap * (range - 1)) / range)
    : BAR_SIZE[range].width;
  const sel = selected != null && selected <= last ? selected : null;

  const value = sel != null ? metric.fmt(values[sel]) : avg != null ? metric.fmt(avg) : '—';
  const selStatus = sel != null && sel !== last ? statusOf(sel) : null;
  const caption = sel != null
    ? `${formatShortDate(days[sel].date)}${sel === last ? ' · so far' : selStatus ? ` · ${milkStatusText(selStatus, milkGoal.capped)}` : ''}`
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
            {target != null ? (
              <>
                <div className="swipe-target" style={{ bottom: TICK_HEIGHT + (target / max) * PLOT_HEIGHT }} />
                <div className="swipe-target-label" style={{ bottom: TICK_HEIGHT + (target / max) * PLOT_HEIGHT }}>{target} oz</div>
              </>
            ) : avg != null && (
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
                      className={`swipe-bar${isToday ? ' is-today' : ''}${isOn ? ' is-on' : ''}${statusOf(i) ? ` milk-${statusOf(i)}` : ''}`}
                      style={{
                        height: `${Math.max((values[i] / max) * 100, 3)}%`,
                        opacity: sel != null && !isOn ? 0.22 : 1,
                      }}
                      aria-pressed={isOn}
                      aria-label={`${formatShortDate(d.date)}: ${[metric.fmt(values[i]), metric.unit].filter(Boolean).join(' ')}${isToday ? ' so far' : statusOf(i) ? `, ${milkStatusText(statusOf(i), milkGoal.capped)}` : ''}`}
                      onClick={() => setSelected(isOn ? null : i)}
                    />
                  </div>
                  <div className="swipe-tick">
                    {isToday
                      ? (isMonday ? formatShortDate(d.date) : 'Today')
                      : isMonday && i * (width + gap) >= scrollPos - 1 && (last - i) * (width + gap) >= LABEL_ROOM
                        ? formatShortDate(d.date)
                        : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {target != null && (
          <div className="milk-legend" aria-hidden="true">
            <span><i className="milk-under" />Under {Math.round(target * 0.9 * 10) / 10} oz</span>
            <span><i className="milk-ontrack" />On track</span>
            <span><i className="milk-over" />Over {target} oz</span>
            <span><i className="is-today" />Today, so far</span>
          </div>
        )}

        <div className="chart-footer">
          <span>Swipe left for earlier weeks. Tap a bar to see that day.</span>
        </div>
      </div>
    </div>
  );
}
