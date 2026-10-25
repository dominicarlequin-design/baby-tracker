'use client';

import Link from 'next/link';
import { useQuickLog } from './QuickLogSheet';

// Tab bar icons (viewBox 24x24), redrawn from Dom's floating-bar mockup:
// a sun rising over soft hills for Today, a lilac outline clock for
// History, three green bars for Insights, and a lilac person for Profile.
// Colors are baked in (not currentColor) so each icon keeps its own color;
// CSS only dims inactive tabs slightly (see .tab-icon in globals.css).
const TAB_ICON_PATHS = {
  log: (
    <>
      <defs>
        <linearGradient id="tab-hill-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f07a98" />
          <stop offset="1" stopColor="#f59aa2" />
        </linearGradient>
        <linearGradient id="tab-hill-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6a08f" />
          <stop offset="1" stopColor="#f9b98a" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#f0607f" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6.6 14.3a5.4 5.4 0 0 1 10.8 0" />
        <path d="M12 3.4v2.2M5.2 6.1l1.5 1.5M18.8 6.1l-1.5 1.5M2.6 11.6h2.1M19.3 11.6h2.1" />
      </g>
      <path fill="url(#tab-hill-b)" d="M10.5 19.6c.8-2.6 2.9-4.2 5.5-4.2 2.9 0 5.2 1.8 5.9 4.2.1.5-.2.9-.7.9H11.2c-.5 0-.8-.4-.7-.9Z" />
      <path fill="url(#tab-hill-a)" d="M2.2 19.6c.9-2.9 3.6-4.8 6.7-4.8 3 0 5.6 1.8 6.6 4.5.2.6-.2 1.2-.8 1.2H3c-.6 0-1-.5-.8-.9Z" />
    </>
  ),
  recent: (
    <g fill="none" stroke="#9a93d8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.6" strokeWidth="2" />
      <path d="M12 7.4v5l3.1 2.6" strokeWidth="2" />
    </g>
  ),
  patterns: (
    <>
      <rect fill="#b7e2c3" x="3.4" y="12.6" width="4.2" height="8.4" rx="2.1" />
      <rect fill="#8fd1a6" x="9.9" y="8.4" width="4.2" height="12.6" rx="2.1" />
      <rect fill="#5bb98a" x="16.4" y="3.4" width="4.2" height="17.6" rx="2.1" />
    </>
  ),
  settings: (
    <>
      <circle fill="#a99be3" cx="12" cy="8" r="4.4" />
      <path fill="#a99be3" d="M4.4 20.2c0-4 3.4-6.7 7.6-6.7s7.6 2.7 7.6 6.7c0 .5-.4.8-.9.8H5.3c-.5 0-.9-.3-.9-.8Z" />
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

// The center "+" opens the universal quick-log popup (lib/QuickLogSheet.js)
// from wherever it's tapped — History, Insights, Profile, or Today itself
// — rather than just navigating to the Log screen. That's Dom's own choice
// among the options given: "Tap + from ANY screen ... a small popup
// appears with one-tap buttons for Fed/Diaper/Nap/Bedtime/Medicine." It
// used to just link to '/' and, on Today specifically, scroll/pulse the
// button grid instead of doing anything on other pages — that fallback is
// gone now that + does something everywhere, including Today, without a
// page change.
function handleFabClick(e, openQuickLog) {
  e.preventDefault();
  openQuickLog();
}

// Shared bottom nav for all pages. Each page passes which tab is its own
// (`active`) rather than this component deriving it from the route,
// matching how the per-page copies of this markup worked before they were
// consolidated here. A page with no matching tab (currently just
// /upcoming, see the comment above) simply renders with nothing
// highlighted rather than forcing a false match.
export function TabBar({ active }) {
  const { openQuickLog } = useQuickLog();

  return (
    <nav className="tab-bar">
      {TABS.map(tab => {
        if (tab.isFab) {
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className="tab-fab"
              aria-label="Quick log"
              onClick={e => handleFabClick(e, openQuickLog)}
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
              <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
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
