'use client';

import Link from 'next/link';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import {
  usePatternsData, formatShortDate, average, currentMilestoneIndex, MILESTONE_STAGES,
} from '../../lib/patterns';

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

function NavRow({ href, title, sub }) {
  return (
    <Link href={href} className="pattern-nav-row">
      <span className="pattern-nav-text">
        <span className="pattern-nav-title">{title}</span>
        <span className="pattern-nav-sub">{sub}</span>
      </span>
      <svg className="pattern-nav-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export default function PatternsPage() {
  const {
    loading, config, age, ageShortLabel, recentWindow, headline, typicalDay,
  } = usePatternsData();

  const milestoneIdx = currentMilestoneIndex(age?.decimalMonths ?? null);
  const milestoneStage = MILESTONE_STAGES[milestoneIdx >= 0 ? milestoneIdx : 0];
  const milestoneSub = age
    ? `Now: ${milestoneStage.label.replace('By ', '')}`
    : 'See what’s typical for her age, as she grows';

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Patterns</h1>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
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

          <NavRow
            href="/patterns/typical-day"
            title="Typical day"
            sub={typicalDay ? 'Naps, wake window, bedtime & feed/diaper gaps' : 'Keep logging two weeks to unlock this'}
          />
          <NavRow
            href="/patterns/compare"
            title="How she compares"
            sub={typicalDay ? `Feeding & sleep vs. typical for ${age ? ageShortLabel : 'her age'}` : 'Keep logging two weeks to unlock this'}
          />
          <NavRow
            href="/patterns/milestones"
            title="Milestones"
            sub={milestoneSub}
          />

          {recentWindow.length > 0 && (
            <button className="export-btn" onClick={() => exportCsv(recentWindow)}>
              Export two weeks for the pediatrician
            </button>
          )}
        </>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
