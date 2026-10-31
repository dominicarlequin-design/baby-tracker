// Well-child checkups (migration 0009). The visit ages follow the American
// Academy of Pediatrics schedule (healthychildren.org, "Well-Child Care: A
// Check-Up for Success"): first week, 1, 2, 4, 6, 9, 12, 15, 18, 24 and 30
// months, then 3 years. Vaccines are whatever her pediatrician gives at each
// visit, so the app records them as notes rather than guessing a schedule.
// Pure functions, no React or Supabase, so node can test them.

export const CHECKUPS = [
  { key: 'week1', label: 'First week', title: 'First-week', days: 4 },
  { key: 'm1', label: '1 month', title: '1-month', months: 1 },
  { key: 'm2', label: '2 months', title: '2-month', months: 2 },
  { key: 'm4', label: '4 months', title: '4-month', months: 4 },
  { key: 'm6', label: '6 months', title: '6-month', months: 6 },
  { key: 'm9', label: '9 months', title: '9-month', months: 9 },
  { key: 'm12', label: '12 months', title: '12-month', months: 12 },
  { key: 'm15', label: '15 months', title: '15-month', months: 15 },
  { key: 'm18', label: '18 months', title: '18-month', months: 18 },
  { key: 'm24', label: '2 years', title: '2-year', months: 24 },
  { key: 'm30', label: '2½ years', title: '2½-year', months: 30 },
  { key: 'y3', label: '3 years', title: '3-year', months: 36 },
];

// A checkup counts as "due" from two weeks before its date until the next
// one comes due; after that, if it was never marked done, it is "missed".
const EARLY_DAYS = 14;

const toDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

// Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28).
export function addMonthsStr(ymd, months) {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = m - 1 + months;
  const yy = y + Math.floor(total / 12);
  const mm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function checkupDueDate(birthDate, c) {
  if (c.days != null) return fromDay(toDay(birthDate) + c.days);
  return addMonthsStr(birthDate, c.months);
}

// Every checkup with its due date and status: 'done' | 'due' | 'missed' |
// 'upcoming'. `records` are baby_checkups rows ({ key, visit_date, notes }).
// `today` is a YYYY-MM-DD string in her timezone.
export function checkupTimeline(birthDate, records, today) {
  if (!birthDate) return [];
  const byKey = new Map((records || []).map(r => [r.key, r]));
  const t = toDay(today);
  return CHECKUPS.map((c, i) => {
    const due = checkupDueDate(birthDate, c);
    const next = CHECKUPS[i + 1];
    const nextDue = next ? checkupDueDate(birthDate, next) : null;
    const rec = byKey.get(c.key) || null;
    let status;
    if (rec && rec.visit_date) status = 'done';
    else if (t < toDay(due) - EARLY_DAYS) status = 'upcoming';
    else if (nextDue && t >= toDay(nextDue) - EARLY_DAYS) status = 'missed';
    else status = 'due';
    return { ...c, due, status, record: rec };
  });
}

// The one to show first: the earliest due checkup, else the next upcoming.
export function nextCheckup(timeline) {
  return timeline.find(c => c.status === 'due') || timeline.find(c => c.status === 'upcoming') || null;
}
