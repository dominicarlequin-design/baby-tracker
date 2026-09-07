'use client';

import { useEffect } from 'react';
import { playClickSound, preloadClickSound } from './sound';

// Plays a short tap sound for every button press across the whole app.
// Wired in once here at the root layout (see app/layout.js) instead of
// inside each individual onClick, so it covers every button — including
// ones on Upcoming/Recent/Patterns/Settings — and new buttons get it
// automatically instead of needing to remember to add it each time.
//
// Listens on `document` in the capture phase specifically so it still
// fires for clicks inside modals, where the modal content's own onClick
// calls stopPropagation() during the bubble phase to keep a background
// overlay-click-to-close from also firing.
export function ClickSoundListener() {
  useEffect(() => {
    preloadClickSound();
    const handleClick = (event) => {
      if (event.target.closest('button')) playClickSound();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
