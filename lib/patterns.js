'use client';

// Shared data + reference tables for the Patterns section (the main
// /patterns page plus its /patterns/typical-day, /patterns/compare, and
// /patterns/milestones sub-pages). Centralized here rather than
// duplicated per page so a fix to the fetch/derivation logic — or to one
// of the reference tables — only has to happen once.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { ageInMonths } from './logic';
import { dailySummaries, bedtimeMinutesLocal } from './summaries';

// Two 14-day windows: the displayed window, and the one before it, so the
// headline and the "typical day" comparisons have something to compare
// against without a second round trip.
export const WINDOW_DAYS = 14;
export const FETCH_DAYS = 35;

export function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

export function formatMinutesDuration(minutes) {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function formatHoursDecimal(hours) {
  if (hours == null) return '—';
  return `${hours.toFixed(1)}h`;
}

export function formatShortDate(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

// Age-banded reference ranges from published pediatric/sleep guidance
// (Cleveland Clinic wake windows, Huckleberry's feeding/sleep-by-age data)
// rather than made up — see the citations on the How-she-compares page.
// Brackets are keyed by `maxMonths`, an EXCLUSIVE upper bound in whole
// months of age: the first bracket whose maxMonths is greater than her
// current age wins, so this automatically moves to the next bracket the
// day she crosses each month-birthday — no manual updating needed as she
// grows. These are general population ranges, not a diagnosis: real
// babies vary, and Settings' fallback/target values (which drive the
// actual due/overdue logic) are what should be tuned to her, not these.
export const AGE_REFERENCE = [
  {
    maxMonths: 1, label: '0–1 month',
    feedsPerDay: { low: 8, high: 12, label: '8–12/day' },
    feedGapHours: { low: 1, high: 3, label: '1–3h' },
    wakeWindowHours: { low: 0.5, high: 1, label: '0.5–1h' },
    napsPerDay: { low: 4, high: 6, label: '4–6/day' },
    totalSleepHours: { low: 16, high: 17, label: '16–17h/day' },
  },
  {
    maxMonths: 3, label: '1–3 months',
    feedsPerDay: { low: 8, high: 12, label: '8–12/day' },
    feedGapHours: { low: 2, high: 3, label: '2–3h' },
    wakeWindowHours: { low: 1, high: 2, label: '1–2h' },
    napsPerDay: { low: 4, high: 5, label: '4–5/day' },
    totalSleepHours: { low: 15, high: 17, label: '15–17h/day' },
  },
  {
    maxMonths: 5, label: '3–5 months',
    feedsPerDay: { low: 8, high: 12, label: '8–12/day' },
    feedGapHours: { low: 3, high: 4, label: '3–4h' },
    wakeWindowHours: { low: 1.25, high: 2.5, label: '1.25–2.5h' },
    napsPerDay: { low: 3, high: 5, label: '3–5/day' },
    totalSleepHours: { low: 14.5, high: 15, label: '14.5–15h/day' },
  },
  {
    maxMonths: 7, label: '5–7 months',
    feedsPerDay: { low: 6, high: 8, label: '6–8/day' },
    feedGapHours: { low: 3.5, high: 4.5, label: '~4h' },
    wakeWindowHours: { low: 2, high: 4, label: '2–4h' },
    napsPerDay: { low: 2, high: 4, label: '2–4/day' },
    totalSleepHours: { low: 14, high: 15, label: '~14h/day' },
  },
  {
    maxMonths: 9, label: '7–9 months',
    feedsPerDay: { low: 5, high: 8, label: '5–8/day' },
    feedGapHours: { low: 3.5, high: 4.5, label: '~4h' },
    wakeWindowHours: { low: 2.5, high: 4.5, label: '2.5–4.5h' },
    napsPerDay: { low: 2, high: 3, label: '2–3/day' },
    totalSleepHours: { low: 14, high: 14, label: '~14h/day' },
  },
  {
    maxMonths: 12, label: '9–12 months',
    feedsPerDay: { low: 4, high: 6, label: '4–6/day' },
    feedGapHours: { low: 3.5, high: 4.5, label: '~4h' },
    wakeWindowHours: { low: 3, high: 6, label: '3–6h' },
    napsPerDay: { low: 2, high: 2, label: '2/day' },
    totalSleepHours: { low: 13, high: 14, label: '13–14h/day' },
  },
  {
    maxMonths: Infinity, label: '12+ months',
    feedsPerDay: { low: 3, high: 5, label: '3–5/day' },
    feedGapHours: { low: 4, high: 5, label: '4–5h' },
    wakeWindowHours: { low: 3, high: 6, label: '3–6h' },
    napsPerDay: { low: 1, high: 2, label: '1–2/day' },
    totalSleepHours: { low: 12, high: 13, label: '12–13h/day' },
  },
];

// Picks the bracket whose maxMonths is the first one greater than her
// current whole-months age — see the comment on AGE_REFERENCE above for
// why this is an exclusive upper bound. Falls back to the 3–5 month
// bracket (this app's original default) when there's no birth date yet.
export function referenceForAge(ageMonths) {
  if (ageMonths == null) return AGE_REFERENCE[2];
  return AGE_REFERENCE.find(b => ageMonths < b.maxMonths) || AGE_REFERENCE[AGE_REFERENCE.length - 1];
}

// Developmental milestones, from the CDC's "Learn the Signs. Act Early."
// checklists (2022 revision — the current version, which moved from 50th
// to 75th percentile milestones so a "typical" child is expected to have
// them by that age, not just half of children). Each stage is a
// well-child-visit checkpoint age, not a range: these are representative
// highlights from each checklist (a few per domain), not the complete
// list — see cdc.gov/act-early/milestones for the full checklists,
// linked in the Milestones page's footnote. General population
// milestones, not a diagnosis or a timeline any one baby has to match;
// the CDC's own guidance is to talk with a pediatrician about anything
// that concerns you rather than reading a missed milestone as a problem
// on its own.
export const MILESTONE_STAGES = [
  {
    months: 2, ageTag: '2 mo', label: 'By 2 months',
    domains: {
      social: ['Calms down when spoken to or picked up', 'Looks at your face', 'Seems happy to see you when you walk up to her', 'Smiles when you talk to or smile at her'],
      language: ['Makes sounds other than crying', 'Reacts to loud sounds'],
      cognitive: ['Watches you as you move', 'Looks at a toy for several seconds'],
      movement: ['Holds head up when on tummy', 'Moves both arms and both legs', 'Opens hands briefly'],
    },
  },
  {
    months: 4, ageTag: '4 mo', label: 'By 4 months',
    domains: {
      social: ['Smiles on her own to get your attention', 'Chuckles (not yet a full laugh) when you try to make her laugh', 'Looks at you, moves, or makes sounds to get or keep your attention'],
      language: ['Makes sounds like "oooo", "aahh" (cooing)', 'Makes sounds back when you talk to her', 'Turns head towards the sound of your voice'],
      cognitive: ['If hungry, opens mouth when she sees breast or bottle', 'Looks at her hands with interest'],
      movement: ['Holds head steady without support when you are holding her', 'Holds a toy when you put it in her hand', 'Uses her arm to swing at toys', 'Brings hands to mouth', 'Pushes up onto elbows/forearms when on tummy'],
    },
  },
  {
    months: 6, ageTag: '6 mo', label: 'By 6 months',
    domains: {
      social: ['Knows familiar people', 'Likes to look at self in a mirror', 'Laughs'],
      language: ['Takes turns making sounds with you', 'Blows "raspberries" (sticks tongue out and blows)', 'Makes squealing noises'],
      cognitive: ['Puts things in her mouth to explore them', 'Reaches to grab a toy she wants', 'Closes lips to show she doesn’t want more food'],
      movement: ['Rolls from tummy to back', 'Pushes up with straight arms when on tummy', 'Leans on hands to support herself when sitting'],
    },
  },
  {
    months: 9, ageTag: '9 mo', label: 'By 9 months',
    domains: {
      social: ['Is shy, clingy, or fearful around strangers', 'Shows several facial expressions, like happy, sad, angry, and surprised', 'Looks when you call her name', 'Reacts when you leave (looks, reaches for you, or cries)', 'Smiles or laughs when you play peek-a-boo'],
      language: ['Makes a lot of different sounds like "mamamama" and "bababababa"', 'Lifts arms up to be picked up'],
      cognitive: ['Looks for objects when dropped out of sight (like her spoon or toy)', 'Bangs two things together'],
      movement: ['Gets to a sitting position by herself', 'Moves things from one hand to her other hand', 'Uses fingers to "rake" food towards herself', 'Sits without support'],
    },
  },
  {
    months: 12, ageTag: '1 yr', label: 'By 1 year',
    domains: {
      social: ['Plays games with you, like pat-a-cake'],
      language: ['Waves "bye-bye"', 'Calls a parent "mama" or "dada" or another special name', 'Understands "no" (pauses briefly or stops when you say it)'],
      cognitive: ['Puts something in a container, like a block in a cup', 'Looks for things she sees you hide, like a toy under a blanket'],
      movement: ['Pulls up to stand', 'Walks, holding on to furniture', 'Drinks from a cup without a lid, as you hold it', 'Picks things up between thumb and pointer finger, like small bits of food'],
    },
  },
  {
    months: 15, ageTag: '15 mo', label: 'By 15 months',
    domains: {
      social: ['Copies other children while playing, like taking toys out of a container when another child does', 'Shows you an object she likes', 'Claps when excited', 'Hugs stuffed doll or other toy', 'Shows you affection (hugs, cuddles, or kisses you)'],
      language: ['Tries to say one or two words besides "mama" or "dada," like "ba" for ball or "da" for dog', 'Looks at a familiar object when you name it', 'Follows directions given with both a gesture and words', 'Points to ask for something or to get help'],
      cognitive: ['Tries to use things the right way, like a phone, cup, or book', 'Stacks at least two small objects, like blocks'],
      movement: ['Takes a few steps on her own', 'Uses fingers to feed herself some food'],
    },
  },
  {
    months: 18, ageTag: '18 mo', label: 'By 18 months',
    domains: {
      social: ['Moves away from you, but looks to make sure you are close by', 'Points to show you something interesting', 'Puts hands out for you to wash them', 'Looks at a few pages in a book with you', 'Helps you dress her by pushing arm through sleeve or lifting up foot'],
      language: ['Tries to say three or more words besides "mama" or "dada"', 'Follows one-step directions without any gestures, like giving you the toy when you say, "Give it to me."'],
      cognitive: ['Copies you doing chores, like sweeping with a broom', 'Plays with toys in a simple way, like pushing a toy car'],
      movement: ['Walks without holding on to anyone or anything', 'Scribbles', 'Drinks from a cup without a lid and may spill sometimes', 'Feeds herself with her fingers', 'Tries to use a spoon', 'Climbs on and off a couch or chair without help'],
    },
  },
  {
    months: 24, ageTag: '2 yr', label: 'By 2 years',
    domains: {
      social: ['Notices when others are hurt or upset, like pausing or looking sad when someone is crying', 'Looks at your face to see how to react in a new situation'],
      language: ['Points to things in a book when you ask, like "Where is the bear?"', 'Says at least two words together, like "More milk."', 'Points to at least two body parts when you ask her to show you', 'Uses more gestures than just waving and pointing, like blowing a kiss or nodding yes'],
      cognitive: ['Holds something in one hand while using the other hand, like holding a container and taking the lid off', 'Tries to use switches, knobs, or buttons on a toy', 'Plays with more than one toy at the same time, like putting toy food on a toy plate'],
      movement: ['Kicks a ball', 'Runs', 'Walks (not climbs) up a few stairs with or without help', 'Eats with a spoon'],
    },
  },
  {
    months: 30, ageTag: '30 mo', label: 'By 30 months',
    domains: {
      social: ['Plays next to other children and sometimes plays with them', 'Shows you what she can do by saying, "Look at me!"', 'Follows simple routines when told, like helping to pick up toys when you say, "It’s clean-up time."'],
      language: ['Says about 50 words', 'Says two or more words together, with one action word, like "Doggie run"', 'Names things in a book when you point and ask, "What is this?"', 'Says words like "I," "me," or "we"'],
      cognitive: ['Uses things to pretend, like feeding a block to a doll as if it were food', 'Shows simple problem-solving skills, like standing on a small stool to reach something', 'Follows two-step instructions like "Put the toy down and close the door."', 'Shows she knows at least one color'],
      movement: ['Uses hands to twist things, like turning doorknobs or unscrewing lids', 'Takes some clothes off by herself, like loose pants or an open jacket', 'Jumps off the ground with both feet', 'Turns book pages, one at a time, when you read to her'],
    },
  },
  {
    months: 36, ageTag: '3 yr', label: 'By 3 years',
    domains: {
      social: ['Calms down within 10 minutes after you leave her, like at a childcare drop off', 'Notices other children and joins them to play'],
      language: ['Talks with you in conversation using at least two back-and-forth exchanges', 'Asks "who," "what," "where," or "why" questions', 'Says what action is happening in a picture or book when asked', 'Says first name, when asked', 'Talks well enough for others to understand, most of the time'],
      cognitive: ['Draws a circle, when you show her how', 'Avoids touching hot objects, like a stove, when you warn her'],
      movement: ['Strings items together, like large beads or macaroni', 'Puts on some clothes by herself, like loose pants or a jacket', 'Uses a fork'],
    },
  },
];

export const MILESTONE_DOMAIN_META = [
  { key: 'social', title: 'Social / Emotional' },
  { key: 'language', title: 'Language / Communication' },
  { key: 'cognitive', title: 'Cognitive' },
  { key: 'movement', title: 'Movement / Physical' },
];

// Index of the checkpoint she's most recently reached (the last one whose
// age is at or before hers) — "current stage" means "what's expected by
// now," not a range she stays in until the next checkup. -1 means she
// hasn't reached the first checkpoint (2 months) yet; that's fine, the
// caller just highlights the 2-month one as "coming up" instead.
export function currentMilestoneIndex(ageMonths) {
  if (ageMonths == null) return -1;
  let idx = -1;
  for (let i = 0; i < MILESTONE_STAGES.length; i++) {
    if (ageMonths >= MILESTONE_STAGES[i].months) idx = i;
  }
  return idx;
}

// Most notable change over the window, in plain language. Headlines on the
// longest-night-stretch metric (the example the design review called out)
// with a supporting line about wake windows; says so plainly if there
// isn't enough history yet rather than inventing a trend from thin data.
export function buildHeadline(priorWindow, recentWindow) {
  const priorStretches = priorWindow.map(d => d.longestNightStretchMinutes).filter(m => m > 0);
  const recentStretches = recentWindow.map(d => d.longestNightStretchMinutes).filter(m => m > 0);

  if (priorStretches.length < 3 || recentStretches.length < 3) {
    return {
      insufficient: true,
      headline: 'Not enough history yet',
      sub: 'Keep logging for a couple of weeks and a trend will show up here.',
    };
  }

  const priorAvg = average(priorStretches);
  const recentAvg = average(recentStretches);

  const priorWake = priorWindow.map(d => d.avgWakeWindowHours).filter(h => h != null);
  const recentWake = recentWindow.map(d => d.avgWakeWindowHours).filter(h => h != null);
  const priorWakeAvg = priorWake.length ? average(priorWake) : null;
  const recentWakeAvg = recentWake.length ? average(recentWake) : null;

  return {
    insufficient: false,
    headline: `Her longest night stretch went from ${formatMinutesDuration(priorAvg)} to ${formatMinutesDuration(recentAvg)} over two weeks`,
    sub: priorWakeAvg != null && recentWakeAvg != null
      ? `Wake windows ${recentWakeAvg >= priorWakeAvg ? 'stretched' : 'shortened'} from ${formatHoursDecimal(priorWakeAvg)} to ${formatHoursDecimal(recentWakeAvg)} on average.`
      : 'Not enough nap data yet to compare wake windows.',
  };
}

// Shared fetch + derivation used by the main Patterns page and all three
// of its sub-pages, so each one doesn't re-implement (and risk drifting
// on) the same config/events fetch and the age/typical-day math.
export function usePatternsData() {
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const since = new Date(Date.now() - FETCH_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [configRes, eventsRes] = await Promise.all([
      supabase.from('baby_config').select('*').eq('id', 1).single(),
      supabase.from('baby_events').select('*').gte('event_time', since).order('event_time', { ascending: false }),
    ]);
    if (configRes.error) console.error(configRes.error);
    if (eventsRes.error) console.error(eventsRes.error);
    if (configRes.data) setConfig(configRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const timezone = config?.timezone || 'America/New_York';

  const age = useMemo(() => {
    if (!config) return null;
    return ageInMonths(config.birth_date, new Date(), timezone);
  }, [config, timezone]);

  const reference = useMemo(() => referenceForAge(age?.months ?? null), [age]);
  const ageLabel = age
    ? `a baby ${age.months} month${age.months === 1 ? '' : 's'} old`
    : `the ${reference.label} bracket (no birth date set)`;
  const ageShortLabel = age
    ? `${age.months} month${age.months === 1 ? '' : 's'}${age.days ? `, ${age.days}d` : ''} old`
    : '';

  const { recentWindow, priorWindow } = useMemo(() => {
    if (!config) return { recentWindow: [], priorWindow: [] };
    const all = dailySummaries(events, config, FETCH_DAYS);
    return {
      recentWindow: all.slice(-WINDOW_DAYS),
      priorWindow: all.slice(-WINDOW_DAYS * 2, -WINDOW_DAYS),
    };
  }, [events, config]);

  const headline = useMemo(
    () => (recentWindow.length ? buildHeadline(priorWindow, recentWindow) : null),
    [priorWindow, recentWindow]
  );

  const typicalDay = useMemo(() => {
    if (recentWindow.length < WINDOW_DAYS) return null;

    const napsCount = average(recentWindow.map(d => d.naps));
    const napsMinutes = average(recentWindow.map(d => d.napMinutes));
    const feedsPerDayAvg = average(recentWindow.map(d => d.feeds));
    const totalSleepHoursAvg = average(recentWindow.map(d => d.totalSleepMinutes / 60));

    // "Current" wake window: the most recent 7 days of the displayed window.
    // "Two weeks ago": the 7-day span immediately before the displayed
    // window — as close to "exactly two weeks back" as daily-summary
    // granularity allows.
    const currentWake = average(recentWindow.slice(7).map(d => d.avgWakeWindowHours).filter(h => h != null));
    const twoWeeksAgoWake = average(priorWindow.slice(7).map(d => d.avgWakeWindowHours).filter(h => h != null));

    const bedtimeMinutes = recentWindow
      .filter(d => d.bedtime)
      .map(d => bedtimeMinutesLocal(d.bedtime, timezone));
    const bedtimeMean = average(bedtimeMinutes);
    const bedtimeSpread = bedtimeMean != null
      ? Math.sqrt(average(bedtimeMinutes.map(m => (m - bedtimeMean) ** 2)))
      : null;

    const feedGaps = recentWindow.map(d => d.avgFeedGapHours).filter(h => h != null);
    const feedGapMean = average(feedGaps);
    const feedGapMin = feedGaps.length ? Math.min(...feedGaps) : null;
    const feedGapMax = feedGaps.length ? Math.max(...feedGaps) : null;

    const diaperGaps = recentWindow.map(d => d.avgDiaperGapHours).filter(h => h != null);
    const diaperGapMean = average(diaperGaps);
    const diaperGapMin = diaperGaps.length ? Math.min(...diaperGaps) : null;
    const diaperGapMax = diaperGaps.length ? Math.max(...diaperGaps) : null;

    return {
      napsCount, napsMinutes, currentWake, twoWeeksAgoWake, bedtimeMean, bedtimeSpread,
      feedGapMean, feedGapMin, feedGapMax, diaperGapMean, diaperGapMin, diaperGapMax,
      feedsPerDayAvg, totalSleepHoursAvg,
    };
  }, [recentWindow, priorWindow, timezone]);

  return {
    loading, config, events, timezone,
    age, reference, ageLabel, ageShortLabel,
    recentWindow, priorWindow, headline, typicalDay,
  };
}
