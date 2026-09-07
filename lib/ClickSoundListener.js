'use client';

import { useEffect } from 'react';
import { playClickSound, preloadClickSounds } from './sound';

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
//
// A button can opt out with data-skip-click-sound="true" — used by the
// sound-style picker in Settings, which plays an explicit preview of the
// style just selected instead of the generic tap (otherwise a style
// change would fire two overlapping sounds: the old style from this
// listener, and the new one from the preview).
//
// The bottom tab bar (Log/Upcoming/Recent/Patterns) is also matched here
// via `.tab-item` — those are <Link>/<span> elements, not <button>, so
// they'd otherwise be silent.
export function ClickSoundListener() {
  useEffect(() => {
    preloadClickSounds();
    const handleClick = (event) => {
      const target = event.target.closest('button, .tab-item');
      if (target && target.dataset.skipClickSound !== 'true') playClickSound();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
