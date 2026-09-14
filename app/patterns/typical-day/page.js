'use client';

import Link from 'next/link';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { formatMinutesAsClock } from '../../../lib/summaries';
import { usePatternsData, formatMinutesDuration, formatHoursDecimal } from '../../../lib/patterns';

export default function TypicalDayPage() {
  const { loading, config, typicalDay } = usePatternsData();

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Patterns</Link>
          <h1>Typical day</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
      </div>

      {loading || !config ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : !typicalDay ? (
        <div className="card">
          <div className="info-item">Keep logging for two weeks and her typical day will show up here — naps, wake window, bedtime, and feed/diaper gaps, all averaged from what you've logged.</div>
        </div>
      ) : (
        <div className="card">
          <div className="section-title">Last two weeks</div>
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

      <TabBar active="patterns" />
    </div>
  );
}
