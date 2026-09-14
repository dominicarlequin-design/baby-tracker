'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { usePatternsData, formatHoursDecimal, WINDOW_DAYS } from '../../../lib/patterns';

function compareToRange(value, range) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < range.low) return 'below';
  if (value > range.high) return 'above';
  return 'within';
}

function compareLabel(cmp) {
  if (cmp === 'below') return 'below typical';
  if (cmp === 'above') return 'above typical';
  if (cmp === 'within') return 'within typical range';
  return '—';
}

// Shared closing paragraph for the "Why?" explainer on each row —
// deliberately doesn't treat "outside the range" as alarming: these are
// population averages, not a target for any one baby, and (per the
// medical-caveat guidance this app follows elsewhere) points back to her
// pediatrician instead of Claude/the app making a call on what it means.
function compareVerdictNote(cmp) {
  if (cmp === 'below') {
    return 'Right now she\'s reading below that typical range. That alone isn\'t a problem — these are population averages, not a target for any individual baby — and it\'s also the number most likely to get pulled down by a logging gap: a day you didn\'t tap something doesn\'t get backfilled, it just reads as less than what actually happened. Worth mentioning to her pediatrician mainly if it comes with something else that concerns you, like appetite, weight gain, or mood.';
  }
  if (cmp === 'above') {
    return 'Right now she\'s reading above that typical range. On its own that\'s usually just normal variation (a growth spurt, for feeding numbers) rather than something to worry about — worth mentioning to her pediatrician mainly if it comes with something else that concerns you.';
  }
  if (cmp === 'within') {
    return 'Right now she\'s within that typical range.';
  }
  return 'Not enough data logged yet to compute this one — it\'ll fill in once more feeds, naps, or sleep are logged.';
}

// Plain-language "how was this number reached, and what does the
// below/above/within verdict mean" for the "Why?" button on each row.
// Mirrors app/page.js's explainStatus() pattern: describes the actual
// math this page just did, not a loose paraphrase, so it can never drift
// from what's really being computed.
function explainCompare(key, typicalDay, reference, ageLabel) {
  if (key === 'feedsPerDay') {
    const v = typicalDay.feedsPerDayAvg;
    const cmp = compareToRange(v, reference.feedsPerDay);
    const gapCheck = typicalDay.feedGapMean != null
      ? ` At her average feed gap of ${formatHoursDecimal(typicalDay.feedGapMean)}, feeding roughly every ${typicalDay.feedGapMean.toFixed(1)} hours works out to about ${(24 / typicalDay.feedGapMean).toFixed(1)} feeds across a full day — close to the ${v.toFixed(1)}/day shown here, so the two numbers agree with each other.`
      : '';
    return `Averaging ${v.toFixed(1)} feeds per day over the last ${WINDOW_DAYS} days (total Fed taps in the window ÷ ${WINDOW_DAYS}).${gapCheck} The typical range for ${ageLabel} is ${reference.feedsPerDay.label}, from Huckleberry's age-by-age feeding guide. ${compareVerdictNote(cmp)}`;
  }

  if (key === 'feedGap') {
    const cmp = compareToRange(typicalDay.feedGapMean, reference.feedGapHours);
    if (typicalDay.feedGapMean == null) return compareVerdictNote(null);
    return `This is the average time between consecutive Fed taps each day, then averaged across the last ${WINDOW_DAYS} days — so a day with a long overnight stretch and otherwise-frequent daytime feeds still counts every gap, not just the extremes. The range shown next to it (${typicalDay.feedGapMin.toFixed(1)}–${typicalDay.feedGapMax.toFixed(1)}h) is her single shortest and single longest day-average across those two weeks. The typical daytime gap for ${ageLabel} is ${reference.feedGapHours.label}, from Huckleberry. ${compareVerdictNote(cmp)}`;
  }

  if (key === 'wakeWindow') {
    const cmp = compareToRange(typicalDay.currentWake, reference.wakeWindowHours);
    if (typicalDay.currentWake == null) return compareVerdictNote(null);
    return `Wake window is the time from a logged Nap ended to the next Nap started (night sleep is excluded, so bedtime never gets counted as one giant "wake window") — this is her average over the most recent week of the two-week window. The typical wake window for ${ageLabel} is ${reference.wakeWindowHours.label}, from Cleveland Clinic's pediatric sleep guidance. ${compareVerdictNote(cmp)}`;
  }

  if (key === 'napsPerDay') {
    const v = typicalDay.napsCount;
    const cmp = compareToRange(v, reference.napsPerDay);
    return `Averaging ${v.toFixed(1)} naps per day over the last ${WINDOW_DAYS} days, counted from Nap started/Nap ended pairs — a nap that was started but never logged as ended doesn't count toward this. The typical nap count for ${ageLabel} is ${reference.napsPerDay.label}, from Huckleberry. ${compareVerdictNote(cmp)}`;
  }

  if (key === 'totalSleep') {
    const v = typicalDay.totalSleepHoursAvg;
    const cmp = compareToRange(v, reference.totalSleepHours);
    return `Adds up nap time plus night sleep time (Bedtime to Wake Up) logged over the last ${WINDOW_DAYS} days, then averaged per day. The typical total for ${ageLabel} is ${reference.totalSleepHours.label}, from Huckleberry's sleep-by-age data (which cites AASM/AAP-aligned guidance). ${compareVerdictNote(cmp)} One specific thing worth checking on this number: a Bedtime tap with no matching Wake Up tap doesn't count toward the total at all rather than being estimated — so a single missed Wake Up tap on even one night can pull this average down noticeably. If this looks lower than you'd expect, check Recent Activity for a night with a Bedtime but no Wake Up before reading too much into it.`;
  }

  return '';
}

function CompareRow({ label, metricKey, value, formatValue, range, onExplain }) {
  const cmp = compareToRange(value, range);
  const toneClass = cmp === 'below' || cmp === 'above' ? 'due-soon' : 'muted';
  return (
    <div className="table-row">
      <span className="table-label">
        {label}
        <button type="button" className="why-btn" onClick={() => onExplain(metricKey)} aria-label={`Why ${label}?`}>Why?</button>
      </span>
      <span className="table-value">
        <span>{formatValue(value)} vs. typical {range.label}</span>
        {cmp && <span className={`more-detail ${toneClass}`} style={{ display: 'block', marginTop: '2px' }}>{compareLabel(cmp)}</span>}
      </span>
    </div>
  );
}

export default function ComparePage() {
  const { loading, config, age, reference, ageLabel, typicalDay } = usePatternsData();
  const [explainCompareKey, setExplainCompareKey] = useState(null);

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Patterns</Link>
          <h1>How she compares</h1>
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
          <div className="info-item">Keep logging for two weeks and she'll be compared against published feeding and sleep ranges for her age.</div>
        </div>
      ) : (
        <div className="card">
          <div className="section-title">
            {age ? `${age.months} month${age.months === 1 ? '' : 's'}${age.days ? `, ${age.days}d` : ''} old` : 'Her stats'}
          </div>
          {!age && (
            <div className="form-hint" style={{ marginBottom: '10px' }}>
              Add her birth date in <Link href="/settings" className="header-settings-link">Settings</Link> so these ranges update automatically as she grows — showing the 3–5 month range for now.
            </div>
          )}
          <CompareRow
            label="Feeds per day"
            metricKey="feedsPerDay"
            value={typicalDay.feedsPerDayAvg}
            formatValue={v => (v == null ? '—' : v.toFixed(1))}
            range={reference.feedsPerDay}
            onExplain={setExplainCompareKey}
          />
          <CompareRow
            label="Feed gap"
            metricKey="feedGap"
            value={typicalDay.feedGapMean}
            formatValue={formatHoursDecimal}
            range={reference.feedGapHours}
            onExplain={setExplainCompareKey}
          />
          <CompareRow
            label="Wake window"
            metricKey="wakeWindow"
            value={typicalDay.currentWake}
            formatValue={formatHoursDecimal}
            range={reference.wakeWindowHours}
            onExplain={setExplainCompareKey}
          />
          <CompareRow
            label="Naps per day"
            metricKey="napsPerDay"
            value={typicalDay.napsCount}
            formatValue={v => (v == null ? '—' : v.toFixed(1))}
            range={reference.napsPerDay}
            onExplain={setExplainCompareKey}
          />
          <CompareRow
            label="Total sleep"
            metricKey="totalSleep"
            value={typicalDay.totalSleepHoursAvg}
            formatValue={formatHoursDecimal}
            range={reference.totalSleepHours}
            onExplain={setExplainCompareKey}
          />
          <div className="form-hint" style={{ marginTop: '10px' }}>
            General published ranges for the {reference.label} bracket, not a diagnosis — every baby varies, and "below/above typical" just means outside the common range, not that something's wrong. These shift automatically as she grows. Check with her pediatrician about anything that concerns you.
          </div>
        </div>
      )}

      {explainCompareKey && typicalDay && (
        <div className="modal-overlay" onClick={() => setExplainCompareKey(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">How this compares</div>
            <div className="explain-body">{explainCompare(explainCompareKey, typicalDay, reference, ageLabel)}</div>
            <button className="modal-btn-confirm form-save" onClick={() => setExplainCompareKey(null)}>Got it</button>
          </div>
        </div>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
