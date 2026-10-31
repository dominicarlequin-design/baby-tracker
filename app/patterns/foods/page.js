'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { EVENTS_CHANGED } from '../../../lib/logText';
import { summarizeFoods, REACTIONS } from '../../../lib/solids';
import { formatRelative } from '../../../lib/homeUi';

const dateLabel = (iso, timezone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric' }).format(new Date(iso));

const REACTION_SHORT = { none: 'No reaction', mild: 'Mild reaction', strong: 'Strong reaction' };

export default function FoodsPage() {
  const [rows, setRows] = useState([]);
  const [timezone, setTimezone] = useState('America/New_York');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const [cfg, ev] = await Promise.all([
      supabase.from('baby_config').select('timezone').eq('id', 1).single(),
      supabase.from('baby_events').select('*').eq('type', 'solid').order('event_time', { ascending: false }).limit(500),
    ]);
    if (cfg.data?.timezone) setTimezone(cfg.data.timezone);
    if (ev.error) console.error(ev.error);
    else setRows(ev.data || []);
    setLoading(false);
    setNow(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(EVENTS_CHANGED, load);
    return () => window.removeEventListener(EVENTS_CHANGED, load);
  }, [load]);

  const { foods, watching, total } = useMemo(() => summarizeFoods(rows, timezone, now), [rows, timezone, now]);

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/patterns" className="header-back-link">‹ Insights</Link>
          <h1>Foods tried</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : total === 0 ? (
        <div className="card">
          <div className="info-item">No solids logged yet. Tap the Solids card on Today after her next meal.</div>
        </div>
      ) : (
        <>
          <div className="card foods-summary">
            <div className="foods-summary-count">{total}</div>
            <div className="foods-summary-text">
              {total === 1 ? 'food tried' : 'foods tried'}
              {watching && <span className="foods-summary-sub">Watching {watching.food.name}: day {watching.day} of {watching.of}</span>}
            </div>
          </div>

          <div className="card foods-list">
            {foods.map(f => (
              <div key={f.key} className="foods-row">
                <div className="foods-row-main">
                  <span className="foods-row-name">{f.name}</span>
                  <span className="foods-row-meta">
                    First tried {dateLabel(f.firstAt, timezone)} · eaten {f.count} {f.count === 1 ? 'time' : 'times'} · last {formatRelative(f.lastAt, now)}
                  </span>
                </div>
                <div className="foods-row-tags">
                  {f.allergen && <span className="foods-tag foods-tag-allergen">Common allergen</span>}
                  <span className={`foods-tag foods-tag-${f.reaction || 'unknown'}`} title={f.reaction ? REACTIONS[f.reaction] : undefined}>
                    {f.reaction ? REACTION_SHORT[f.reaction] : 'No reaction logged'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="form-hint foods-note">
            General guidance only: one new food at a time, a few days apart. Ask her pediatrician about allergens and any reaction.
          </div>
        </>
      )}

      <TabBar active="patterns" />
    </div>
  );
}
