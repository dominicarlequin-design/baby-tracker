'use client';

import Link from 'next/link';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { SwipeChart } from '../../lib/SwipeChart';
import { dailyMilkTarget } from '../../lib/milk';
import { STAGES, stageIndexForAge } from '../../lib/recipes';
import { RecipeArt } from '../../lib/RecipeArt';
import {
  usePatternsData, currentMilestoneIndex, MILESTONE_STAGES,
} from '../../lib/patterns';

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
    loading, config, age, ageShortLabel, recentWindow, chartWindow, headline, typicalDay,
  } = usePatternsData();

  const milestoneIdx = currentMilestoneIndex(age?.decimalMonths ?? null);
  const milestoneStage = MILESTONE_STAGES[milestoneIdx >= 0 ? milestoneIdx : 0];
  const milestoneSub = age
    ? `Now: ${milestoneStage.label.replace('By ', '')}`
    : 'See what’s typical for her age, as she grows';

  return (
    <div className="wrap">
      <div className="header-row">
        <h1>Insights</h1>
        <div className="header-actions">
          <ThemeToggle />
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

          {chartWindow.length > 0 && <SwipeChart days={chartWindow} milkGoal={dailyMilkTarget(config.weight_lbs)} />}

          <NavRow
            href="/patterns/typical-day"
            title="Typical day"
            sub={typicalDay ? 'Naps, wake windows & bedtime' : 'Keep logging two weeks to unlock this'}
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
          <Link href="/patterns/recipes" className="pattern-nav-row recipe-nav-row">
            <RecipeArt name="bowl" size="sm" />
            <span className="pattern-nav-text">
              <span className="pattern-nav-title">Recipes for her age</span>
              <span className="pattern-nav-sub">
                {age ? `Now: ${STAGES[stageIndexForAge(age.decimalMonths)].name} · ${STAGES[stageIndexForAge(age.decimalMonths)].texture.toLowerCase()}` : 'Purées, mashes & finger foods, 6–12 months'}
              </span>
            </span>
            <svg className="pattern-nav-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>

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
