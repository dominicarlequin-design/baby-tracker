'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

// Icon paths for the bottom tab bar, in the same stroke style as the Log
// page's category icons (viewBox 24x24, currentColor, 1.8 stroke). Relabeled
// to match the reference look's Today/History/Insights/Profile + center "+"
// bar — house/clock/chart/person here replace the old compass/clock-outline/
// list/trend-line set so the glyphs actually read as those words, not just
// the old labels wearing new text.
const TAB_ICON_PATHS = {
  log: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </>
  ),
  recent: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  patterns: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c1.2-3.8 4.3-6 7.5-6s6.3 2.2 7.5 6" />
    </>
  ),
};

// The reference's Today/History/+/Insights/Profile bar, mapped onto this
// app's existing 4 pages rather than inventing new screens for it: "Log"
// (Today's mixed dashboard-plus-log-buttons screen) becomes "Today", Recent
// becomes "History", Patterns becomes "Insights", and the Settings page
// (previously reached only from the header link, not the tab bar) becomes
// "Profile". Upcoming keeps its own page/route; it just isn't one of the 5
// tab slots any more (its content is a fuller version of the Log page's own
// "Next Up" card, not a distinct concept in the reference).
const TABS = [
  { key: 'log', href: '/', label: 'Today' },
  { key: 'recent', href: '/recent', label: 'History' },
  { key: 'add', href: '/', label: '', isFab: true },
  { key: 'patterns', href: '/patterns', label: 'Insights' },
  { key: 'settings', href: '/settings', label: 'Profile' },
];

// The center "+" is a visual match for the reference's raised FAB, not a
// new quick-add screen — but it still needs to visibly DO something
// wherever it's tapped from, not just silently link to '/'. Elsewhere in
// the app, it navigates to the Log screen like any tab. Already on the Log
// screen, there's nowhere new to go, so it scrolls the button grid into
// view and gives it a brief highlight instead of doing nothing.
function handleFabClick(e, router, pathname) {
  if (pathname === '/') {
    e.preventDefault();
    const el = document.querySelector('.btn-grid');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('quick-add-pulse');
      setTimeout(() => el.classList.remove('quick-add-pulse'), 900);
    }
  }
  // Otherwise let the Link navigate to '/' normally.
}

// Shared bottom nav for all pages. Each page passes which tab is its own
// (`active`) rather than this component deriving it from the route,
// matching how the per-page copies of this markup worked before they were
// consolidated here. A page with no matching tab (currently just
// /upcoming, see the comment above) simply renders with nothing
// highlighted rather than forcing a false match.
export function TabBar({ active }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav className="tab-bar">
      {TABS.map(tab => {
        if (tab.isFab) {
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className="tab-fab"
              aria-label="Log an entry"
              onClick={e => handleFabClick(e, router, pathname)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
          );
        }
        const isActive = tab.key === active;
        const inner = (
          <>
            <span className="tab-icon-wrap">
              <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {TAB_ICON_PATHS[tab.key]}
              </svg>
            </span>
            <span className="tab-label">{tab.label}</span>
          </>
        );
        return isActive ? (
          <span key={tab.key} className="tab-item tab-active" aria-current="page">{inner}</span>
        ) : (
          <Link key={tab.key} href={tab.href} className="tab-item">{inner}</Link>
        );
      })}
    </nav>
  );
}
