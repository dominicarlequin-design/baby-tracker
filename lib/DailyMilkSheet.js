'use client';

// Daily Milk: today's ounces against the weight-based goal, today's
// bottles, and a suggested next bottle. Opened from the Feeds tile in
// History's "Today's stats". Hidden until a weight is set on Profile
// (dailyMilkTarget returns null without one).
import { useMemo } from 'react';
import { localDateStr } from './logic';
import { dailySummaries } from './summaries';
import { dailyMilkTarget, milkStatus, milkStatusText, usualFeedsPerDay, nextBottle } from './milk';
import { formatLocalTime, TileIcon } from './homeUi';

export function useDailyMilk(events, config, now) {
  return useMemo(() => {
    if (!config) return null;
    const goal = dailyMilkTarget(config.weight_lbs);
    if (!goal) return null;
    const tz = config.timezone || 'America/New_York';
    const todayKey = localDateStr(now, tz);
    const bottles = [];
    let oz = 0;
    for (const e of events) {
      if (e.type !== 'feed' || typeof e.feed_ounces !== 'number') continue;
      if (localDateStr(new Date(e.event_time), tz) !== todayKey) continue;
      oz += e.feed_ounces;
      bottles.push({ id: e.id, time: e.event_time, ounces: e.feed_ounces });
    }
    bottles.sort((a, b) => new Date(a.time) - new Date(b.time));
    const days = dailySummaries(events, config, 8);
    const today = days[days.length - 1];
    const status = milkStatus(oz, goal.target);
    return {
      ...goal,
      oz,
      bottles,
      status,
      statusText: milkStatusText(status, goal.capped),
      pct: Math.min(oz / goal.target, 1) * 100,
      next: nextBottle(oz, goal.target, today?.feeds ?? 0, usualFeedsPerDay(days.slice(0, -1))),
      weightLbs: config.weight_lbs,
      timezone: tz,
    };
  }, [events, config, now]);
}

export function DailyMilkSheet({ milk, onClose }) {
  if (!milk) return null;
  const round = (n) => Math.round(n * 10) / 10;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal milk-sheet" role="dialog" aria-label="Daily Milk" onClick={e => e.stopPropagation()}>
        <div className="milk-sheet-grabber" aria-hidden="true" />
        <div className="milk-sheet-head">
          <h2 className="milk-sheet-title">Daily Milk</h2>
          <button type="button" className="milk-sheet-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="milk-progress-card">
          <div className="milk-progress-top">
            <span className="milk-progress-head">{milk.oz} oz of {milk.target} oz today</span>
            <span className="milk-progress-left">
              {milk.oz > milk.target ? `${round(milk.oz - milk.target)} oz over` : `${round(milk.next.left)} oz to go`}
            </span>
          </div>
          <div
            className={`milk-bar milk-bar-lg milk-${milk.status}`}
            role="progressbar"
            aria-label="Milk today"
            aria-valuemin={0}
            aria-valuemax={milk.target}
            aria-valuenow={milk.oz}
          >
            <div className="milk-bar-fill" style={{ width: `${milk.pct}%` }} />
          </div>
          <div className="milk-progress-note">
            Target: {milk.weightLbs} lbs × 2.5 oz{milk.capped ? ', capped at 32 oz' : ''}
          </div>
        </div>

        <div className="stats-caption">Today's bottles</div>
        {milk.bottles.length ? (
          <ul className="milk-bottles">
            {milk.bottles.map(b => (
              <li key={b.id} className="milk-bottle">
                <TileIcon name="feed" />
                <span className="milk-bottle-time">{formatLocalTime(b.time, milk.timezone)}</span>
                <span className="milk-bottle-oz">{b.ounces} oz</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="milk-bottles milk-bottles-empty">No bottles with ounces logged yet today.</div>
        )}

        <div className="milk-next">
          {milk.next.left > 0 ? (
            <>
              <div className="milk-next-head">Next bottle: about {milk.next.ounces} oz</div>
              <div className="milk-next-sub">
                {round(milk.next.left)} oz left over her usual {milk.next.feedsLeft} more {milk.next.feedsLeft === 1 ? 'feed' : 'feeds'}
              </div>
            </>
          ) : (
            <>
              <div className="milk-next-head">Target reached for today</div>
              <div className="milk-next-sub">Keep following her hunger cues.</div>
            </>
          )}
        </div>

        <p className="milk-caption">A guide, not a rule. Hunger cues come first.</p>
      </div>
    </div>
  );
}
