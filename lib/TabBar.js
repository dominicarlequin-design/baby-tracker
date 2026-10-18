'use client';

import Link from 'next/link';
import { useQuickLog } from './QuickLogSheet';

// Sticker-style icon paths for the bottom tab bar (viewBox 24x24), drawn
// with the same technique as the Log buttons' category icons in
// lib/homeUi.js: every shape is rendered twice — once thick in white
// beneath (the halo/die-cut border) and once on top in its real flat
// color with a thin unified outline — plus a small glossy highlight
// ellipse, so these read as the same sticker family rather than plain
// line icons. Colors are baked into each path (not currentColor) since a
// sticker looks the same regardless of what's behind it; CSS dims/scales
// the whole icon for the inactive vs active state instead (see
// .tab-icon / .tab-active .tab-icon in globals.css). Replaces the
// earlier currentColor line-icon set so the nav bar matches the rest of
// the app's illustration style, at Dom's request after seeing a mockup.
const TAB_ICON_PATHS = {
  log: (
    <>
      <path fill="#f4a3b5" d="M2.5 11.2 12 3.6l9.5 7.6-1.2 1.5L12 6 3.7 12.7Z" />
      <path fill="#fbeecb" d="M5 11.4 12 5.9l7 5.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19Z" />
      <rect fill="#f2b95e" x="10" y="13.6" width="4" height="6.9" rx="1.2" />
    </>
  ),
  recent: (
    <>
      <circle fill="#bcd6f5" cx="12" cy="12.5" r="9" />
      <circle fill="#fff" cx="12" cy="12.5" r="6.6" />
      <path fill="none" stroke="#5b7fb5" strokeWidth="1.8" strokeLinecap="round" d="M12 8.6v4.2l2.9 1.9" />
    </>
  ),
  patterns: (
    <>
      <rect fill="#f4a3b5" x="3" y="13" width="4.6" height="8" rx="1.6" />
      <rect fill="#f7d77a" x="9.7" y="8.5" width="4.6" height="12.5" rx="1.6" />
      <rect fill="#7fc8b5" x="16.4" y="3.5" width="4.6" height="17.5" rx="1.6" />
    </>
  ),
  settings: (
    <>
      <path fill="#9b86d8" d="M4.5 21c.8-4.4 3.8-6.8 7.5-6.8s6.7 2.4 7.5 6.8Z" />
      <circle fill="#f3c9a0" cx="12" cy="8.4" r="4.3" />
      <path fill="#7a63c4" d="M7.7 8.2a4.3 4.3 0 0 1 8.6 0c-1.6.8-3.1.5-4.3-.5-1.2 1-2.7 1.3-4.3.5Z" />
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
