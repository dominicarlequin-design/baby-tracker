'use client';

import { useCallback, useEffect, useState } from 'react';

// Inline script injected into <head> (see app/layout.js) so an explicit
// override applies before first paint — otherwise a user who picked Light
// on a dark-mode device would see one frame of dark before this component
// mounts and corrects it. Reading it back out here (rather than duplicating
// the logic) keeps the two in sync by construction.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

function currentAppliedTheme() {
  if (typeof document === 'undefined') return 'light';
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Small sun/moon toggle dropped into each page's header-row next to the
// Settings link. Cycles whatever appearance is currently showing (system
// default or a prior override) to its opposite and pins that choice going
// forward — simpler for a bleary 2am tap than exposing a three-way
// light/dark/system control.
export function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    setTheme(currentAppliedTheme());
    // Keeps the icon honest if the OS-level appearance changes (e.g. auto
    // dark-at-sunset) while no explicit override has been set yet.
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!localStorage.getItem('theme')) setTheme(currentAppliedTheme());
    };
    mql?.addEventListener?.('change', onChange);
    return () => mql?.removeEventListener?.('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = currentAppliedTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
    setTheme(next);
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
