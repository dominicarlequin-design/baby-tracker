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
      <path fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" d="M3.3 11.3 12 4.2l8.7 7.1v1.1L12 5.6 3.3 12.4Z" />
      <path fill="#e2574f" stroke="#a83830" strokeWidth="0.9" strokeLinejoin="round" d="M3.3 11.3 12 4.2l8.7 7.1v1.1L12 5.6 3.3 12.4Z" />
      <path fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" d="M5.6 10.4V19a1 1 0 0 0 1 1H9.4v-4.6a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1V20h2.8a1 1 0 0 0 1-1v-8.6" />
      <path fill="#fbe9d8" stroke="#a87c52" strokeWidth="0.9" strokeLinejoin="round" d="M5.6 10.4V19a1 1 0 0 0 1 1H9.4v-4.6a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1V20h2.8a1 1 0 0 0 1-1v-8.6" />
      <rect fill="#8a5a3a" x="10.3" y="15" width="3.4" height="5" rx="0.4" />
      <circle fill="#f0cf5f" cx="12.9" cy="17.5" r="0.35" />
      <ellipse fill="#fff" opacity="0.5" cx="7" cy="8.2" rx="1.3" ry="0.7" />
    </>
  ),
  recent: (
    <>
      <circle fill="#fff" stroke="#fff" strokeWidth="2.6" cx="12" cy="12.5" r="8.2" />
      <circle fill="#8fc2e8" stroke="#3d6f99" strokeWidth="0.9" cx="12" cy="12.5" r="8.2" />
      <circle fill="#fdf6e3" stroke="#3d6f99" strokeWidth="0.6" cx="12" cy="12.5" r="6.1" />
      <path fill="none" stroke="#2c4f70" strokeWidth="1.5" strokeLinecap="round" d="M12 8.6v4.2l2.9 1.9" />
      <circle fill="#2c4f70" cx="12" cy="12.5" r="0.7" />
      <rect fill="#8fc2e8" stroke="#3d6f99" strokeWidth="0.6" x="10.6" y="2.6" width="2.8" height="2" rx="0.6" />
      <ellipse fill="#fff" opacity="0.5" cx="9" cy="9" rx="1.3" ry="0.8" />
    </>
  ),
  patterns: (
    <>
      <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="3.3" y="14.3" width="4" height="6.7" rx="1" />
      <rect fill="#6fb7c9" stroke="#366f7d" strokeWidth="0.8" x="3.3" y="14.3" width="4" height="6.7" rx="1" />
      <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="9.8" y="10.3" width="4" height="10.7" rx="1" />
      <rect fill="#5fa8d8" stroke="#2f5d80" strokeWidth="0.8" x="9.8" y="10.3" width="4" height="10.7" rx="1" />
      <rect fill="#fff" stroke="#fff" strokeWidth="2.4" x="16.3" y="5.3" width="4" height="15.7" rx="1" />
      <rect fill="#4fae6e" stroke="#2c6b42" strokeWidth="0.8" x="16.3" y="5.3" width="4" height="15.7" rx="1" />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M3 10.5l5.3-5 3.8 3.4L19.5 2.8" />
      <path fill="none" stroke="#e2914f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M3 10.5l5.3-5 3.8 3.4L19.5 2.8" />
      <path fill="none" stroke="#e2914f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M14.8 2.8h4.7v4.7" />
    </>
  ),
  settings: (
    <>
      <circle fill="#fff" stroke="#fff" strokeWidth="2.6" cx="12" cy="8.3" r="4.1" />
      <circle fill="#f3c9a0" stroke="#a87c52" strokeWidth="0.9" cx="12" cy="8.3" r="4.1" />
      <path fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" d="M12 5.2a4.1 4.1 0 0 1 4 3.2c-1.4.6-2.7.3-4-.6-1.3.9-2.6 1.2-4 .6a4.1 4.1 0 0 1 4-3.2Z" />
      <path fill="#6d4a35" stroke="#4a311f" strokeWidth="0.6" strokeLinejoin="round" d="M12 5.2a4.1 4.1 0 0 1 4 3.2c-1.4.6-2.7.3-4-.6-1.3.9-2.6 1.2-4 .6a4.1 4.1 0 0 1 4-3.2Z" />
      <path fill="#fff" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" d="M4.3 20.3c1.1-4.2 4.4-6.6 7.7-6.6s6.6 2.4 7.7 6.6Z" />
      <path fill="#7a3d99" stroke="#4f2569" strokeWidth="0.9" strokeLinejoin="round" d="M4.3 20.3c1.1-4.2 4.4-6.6 7.7-6.6s6.6 2.4 7.7 6.6Z" />
      <path fill="none" stroke="#fff" strokeWidth="0.9" opacity="0.7" strokeLinecap="round" d="M10.4 14.2v2.3M13.6 14.2v2.3" />
      <ellipse fill="#fff" opacity="0.5" cx="10.2" cy="6.8" rx="1" ry="0.6" />
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
