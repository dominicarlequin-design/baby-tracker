'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import {
  usePatternsData, MILESTONE_STAGES, MILESTONE_DOMAIN_META, currentMilestoneIndex,
} from '../../../lib/patterns';

export default function MilestonesPage() {
  const { loading, config, age, ageShortLabel } = usePatternsData();
  const ageMonths = age?.decimalMonths ?? null;
  const hasBirthDate = !!age;

  const currentIdx = useMemo(() => currentMilestoneIndex(ageMonths), [ageMonths]);
  const defaultIdx = currentIdx >= 0 ? currentIdx : 0;
  const [selectedIdx, setSelectedIdx] = useState(null);
  const activeIdx = selectedIdx ?? defaultIdx;
  const stage = MILESTONE_STAGES[activeIdx];

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Patterns</Link>
          <h1>Milestones</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <Link href="/settings" className="header-settings-link">Settings</Link>
        </div>
      </div>

      {loading || !config ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <div className="card">
          <div className="section-title">{hasBirthDate ? ageShortLabel : 'Timeline'}</div>
          {!hasBirthDate && (
            <div className="form-hint" style={{ marginBottom: '10px' }}>
              Add her birth date in <Link href="/settings" className="header-settings-link">Settings</Link> to see her current stage highlighted automatically — showing the full timeline for now.
            </div>
          )}

          <div className="milestone-stagebar">
            {MILESTONE_STAGES.map((s, i) => {
              const isPast = i < currentIdx;
              const isCurrent = i === currentIdx;
              const isNext = i === currentIdx + 1;
              const isSelected = i === activeIdx;
              const tag = isCurrent ? 'Now' : isNext ? 'Next' : '';
              const cls = [
                'milestone-stage-pill',
                isPast && 'is-past',
                isCurrent && 'is-current',
                isNext && 'is-next',
                isSelected && 'is-selected',
              ].filter(Boolean).join(' ');
              return (
                <button key={s.months} type="button" className={cls} onClick={() => setSelectedIdx(i)}>
                  <span className="milestone-stage-age">{s.ageTag}</span>
                  <span className="milestone-stage-tag">{tag}</span>
                </button>
              );
            })}
          </div>

          <div className="table-label" style={{ marginBottom: '10px' }}>{stage.label}</div>

          {MILESTONE_DOMAIN_META.map(({ key, title }) => (
            <div key={key} className={`milestone-domain ${key}`}>
              <div className="milestone-domain-title">{title}</div>
              <ul className="milestone-list">
                {stage.domains[key].map((item, i) => (
                  <li key={i} className="milestone-item">{item}</li>
                ))}
              </ul>
            </div>
          ))}

          <div className="form-hint" style={{ marginTop: '14px' }}>
            A representative sample from the CDC&apos;s &quot;Learn the Signs. Act Early.&quot; checklists, not the complete list — see{' '}
            <a href="https://www.cdc.gov/act-early/milestones/index.html" target="_blank" rel="noreferrer" className="header-settings-link">
              cdc.gov/act-early/milestones
            </a>{' '}
            for every item. These are general population milestones, not a diagnosis or a deadline — every baby varies, and it’s worth mentioning anything that concerns you to her pediatrician rather than reading a missed one as a problem on its own.
          </div>
        </div>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
