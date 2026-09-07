'use client';

import Link from 'next/link';

// Icon paths for the bottom tab bar, in the same stroke style as the Log
// page's category icons (viewBox 24x24, currentColor, 1.8 stroke).
const TAB_ICON_PATHS = {
  log: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </>
  ),
  upcoming: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  recent: (
    <>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  patterns: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </>
  ),
};

const TABS = [
  { key: 'log', href: '/', label: 'Log' },
  { key: 'upcoming', href: '/upcoming', label: 'Upcoming' },
  { key: 'recent', href: '/recent', label: 'Recent' },
  { key: 'patterns', href: '/patterns', label: 'Patterns' },
];

// Shared bottom nav for all 4 pages. Each page passes which tab is its
// own (`active`) rather than this component deriving it from the route,
// matching how the 4 copies of this markup worked before they were
// consolidated here — one fewer thing to keep in sync by hand.
export function TabBar({ active }) {
  return (
    <nav className="tab-bar">
      {TABS.map(tab => {
        const isActive = tab.key === active;
        const inner = (
          <>
            <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {TAB_ICON_PATHS[tab.key]}
            </svg>
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
