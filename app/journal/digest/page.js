'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { ThemeToggle } from '../../../lib/theme';
import { TabBar } from '../../../lib/TabBar';
import { localDateStr } from '../../../lib/logic';
import { formatGroupDate, formatLocalTime } from '../../../lib/homeUi';

const DIGEST_DAYS = 7;

const MOOD_LABELS = {
  happy: 'Happy',
  calm: 'Calm',
  fussy: 'Fussy',
  sick: 'Sick',
  milestone: 'Milestone',
};

// Same fetch-with-a-timeout shape as app/journal/page.js's config fetch —
// a hung request (not just a refused one) would otherwise leave this page
// stuck on "Loading…" forever instead of falling back to a usable default.
async function withTimeout(promise, ms, timeoutError) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutError)), ms)),
  ]);
}

function groupByDay(entries, timezone, now) {
  const todayStr = localDateStr(now, timezone);
  const yesterdayStr = localDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone);
  const groups = [];
  let currentDay = null;
  let currentGroup = null;
  for (const entry of entries) {
    const dayStr = localDateStr(new Date(entry.entry_time), timezone);
    if (dayStr !== currentDay) {
      currentDay = dayStr;
      currentGroup = {
        dayStr,
        label: dayStr === todayStr ? 'Today' : dayStr === yesterdayStr ? 'Yesterday' : formatGroupDate(dayStr),
        items: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.items.push(entry);
  }
  return groups;
}

// Plain-text rendering of the digest, used both for the Share sheet and the
// copy-to-clipboard fallback — kept as one function so the two can never
// drift into describing different content.
function buildDigestText(groups, rangeLabel) {
  const lines = [`Baby Tracker — weekly digest (${rangeLabel})`, ''];
  if (!groups.length) {
    lines.push('No journal entries this week.');
    return lines.join('\n');
  }
  for (const group of groups) {
    lines.push(group.label.toUpperCase());
    for (const entry of group.items) {
      const time = formatLocalTime(entry.entry_time, entry.__timezone);
      const moodTag = entry.mood ? ` [${MOOD_LABELS[entry.mood] || entry.mood}]` : '';
      const heading = entry.title ? entry.title : 'Journal entry';
      lines.push(`${time} — ${heading}${moodTag}`);
      lines.push(entry.note);
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

export default function JournalDigestPage() {
  const [timezone, setTimezone] = useState('America/New_York');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [shareState, setShareState] = useState('idle'); // idle | copied | failed

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    let tz = 'America/New_York';
    try {
      const { data, error } = await withTimeout(
        supabase.from('baby_config').select('timezone').eq('id', 1).single(),
        4000,
        'timed out',
      );
      if (!error && data?.timezone) tz = data.timezone;
    } catch (err) {
      console.error(err);
    }
    setTimezone(tz);

    const since = new Date(Date.now() - DIGEST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data, error } = await withTimeout(
        supabase.from('baby_journal').select('*').gte('entry_time', since).order('entry_time', { ascending: false }),
        4000,
        'timed out',
      );
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => groupByDay(entries, timezone, now), [entries, timezone, now]);

  const rangeLabel = `last ${DIGEST_DAYS} days`;
  const digestText = useMemo(
    () => buildDigestText(groups.map(g => ({ ...g, items: g.items.map(e => ({ ...e, __timezone: timezone })) })), rangeLabel),
    [groups, timezone, rangeLabel],
  );

  const moodCounts = useMemo(() => {
    const counts = {};
    for (const e of entries) {
      if (!e.mood) continue;
      counts[e.mood] = (counts[e.mood] || 0) + 1;
    }
    return counts;
  }, [entries]);

  const handleShare = useCallback(async () => {
    setShareState('idle');
    const shareData = { title: 'Weekly digest', text: digestText };
    if (navigator.share && navigator.canShare?.(shareData) !== false) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // AbortError just means the user dismissed the share sheet — not a
        // real failure, so it doesn't fall through to the clipboard copy.
        if (err?.name === 'AbortError') return;
        console.error(err);
      }
    }
    try {
      await navigator.clipboard.writeText(digestText);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1800);
    } catch (err) {
      console.error(err);
      setShareState('failed');
      setTimeout(() => setShareState('idle'), 1800);
    }
  }, [digestText]);

  return (
    <div className="wrap">
      <div className="header-row">
        <div>
          <Link href="/journal" className="header-back-link">&lsaquo; Journal</Link>
          <h1>Weekly digest</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div className="card">
        <div className="section-title">This week</div>
        {loading ? (
          <div className="form-hint">Loading…</div>
        ) : (
          <>
            <div className="form-hint">
              {entries.length === 0
                ? `No journal entries in the ${rangeLabel}.`
                : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in the ${rangeLabel}.`}
              {loadError && ' (showing what loaded before the connection dropped)'}
            </div>
            {Object.keys(moodCounts).length > 0 && (
              <div className="digest-mood-row">
                {Object.entries(moodCounts).map(([mood, count]) => (
                  <span key={mood} className="digest-mood-chip">{MOOD_LABELS[mood] || mood} · {count}</span>
                ))}
              </div>
            )}
            <button
              className={`modal-btn-confirm form-save ${shareState === 'copied' ? 'is-success' : ''} ${shareState === 'failed' ? 'is-error' : ''}`}
              onClick={handleShare}
              disabled={entries.length === 0}
            >
              {shareState === 'copied' ? 'Copied to clipboard' : shareState === 'failed' ? "Couldn't copy — try again" : 'Share this week'}
            </button>
          </>
        )}
      </div>

      {!loading && groups.length > 0 && (
        <div className="card">
          <div className="history">
            {groups.map(group => (
              <div key={group.dayStr} className="activity-group">
                <div className="activity-day-label">{group.label}</div>
                {group.items.map(entry => (
                  <div key={entry.id} className="journal-entry">
                    <div className="journal-entry-head">
                      <span className="journal-entry-title">{entry.title || 'Journal entry'}</span>
                      <span className="activity-time">{formatLocalTime(entry.entry_time, timezone)}</span>
                    </div>
                    {entry.mood && (
                      <span className="digest-mood-chip journal-entry-mood">{MOOD_LABELS[entry.mood] || entry.mood}</span>
                    )}
                    <div className="journal-entry-note">{entry.note}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <TabBar active="journal" />
    </div>
  );
}
