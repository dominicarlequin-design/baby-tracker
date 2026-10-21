'use client';

import { useEffect, useState } from 'react';

// Soft background behind Today: a faint glow whose color follows the time
// of day (peach morning, blush afternoon, orchid dusk, lavender night),
// plus a few twinkling stars that only show while she's napping or asleep.
//
// The glow sits as two blurred radial washes near the top instead of a band
// running into the top edge, so it never butts up against the solid status
// bar on an installed iPhone app. Colors are blended hour by hour (not
// switched at fixed times), so the shift through the day is gradual.
//
// Purely decorative: aria-hidden, pointer-events off, sits behind content.
// Twinkling turns off under "Reduce Motion" (see .sky-star in globals.css).

// [hour, light-mode color, dark-mode color]. 24 repeats 0 so the blend wraps.
const SKY_KEYS = [
  [0, '#d8caf6', '#3a2654'],
  [5, '#dccbf2', '#382545'],
  [7, '#ffd3bf', '#4a2e33'],
  [10, '#ffd9e6', '#452636'],
  [15, '#ffd5e8', '#452639'],
  [18, '#ecc8f4', '#43264f'],
  [20, '#d8caf6', '#3a2654'],
  [24, '#d8caf6', '#3a2654'],
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map(v => Math.round(v));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function skyColors(hour) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h1, l1, d1] = SKY_KEYS[i];
    const [h2, l2, d2] = SKY_KEYS[i + 1];
    if (hour >= h1 && hour <= h2) {
      const t = (hour - h1) / (h2 - h1);
      return { light: mix(l1, l2, t), dark: mix(d1, d2, t) };
    }
  }
  return { light: SKY_KEYS[0][1], dark: SKY_KEYS[0][2] };
}

// Fractional local hour (e.g. 17.5 for 5:30 PM) in the baby's timezone.
function localHour(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h + m / 60;
}

// Fixed positions (percent of the top area) so stars don't jump around on
// every 10-second re-render. Mostly scattered around the header and the gaps
// between the log buttons, where the background actually shows.
const STARS = [
  { x: 52, y: 4, s: 3, d: 0 },
  { x: 68, y: 9, s: 2, d: 1.4 },
  { x: 40, y: 12, s: 2, d: 2.6 },
  { x: 88, y: 3, s: 2.5, d: 0.8 },
  { x: 8, y: 47, s: 2, d: 2.1 },
  { x: 33, y: 49, s: 3, d: 0.4 },
  { x: 66, y: 46, s: 2, d: 3.1 },
  { x: 93, y: 51, s: 2.5, d: 1.7 },
  { x: 33, y: 70, s: 2, d: 2.8 },
  { x: 66, y: 72, s: 3, d: 1.1 },
  { x: 5, y: 76, s: 2, d: 0.2 },
  { x: 95, y: 74, s: 2, d: 2.4 },
];
const SPARKLES = [
  { x: 60, y: 6, d: 0.6 },
  { x: 50, y: 59, d: 2.2 },
  { x: 16, y: 61, d: 1.3 },
];

export function SkyBackdrop({ now, timezone, asleep }) {
  // Drawn only after mount: the server renders with its own clock, and React
  // keeps server-rendered inline styles on hydration, so a server-side sky
  // would show the wrong time of day until the next re-render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const { light, dark } = skyColors(localHour(now, timezone));
  return (
    <div className="sky" aria-hidden="true" style={{ '--sky-light': light, '--sky-dark': dark }}>
      <div className={`sky-stars ${asleep ? 'is-on' : ''}`}>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="sky-star"
            style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }}
          />
        ))}
        {SPARKLES.map((sp, i) => (
          <svg
            key={`s${i}`}
            className="sky-star sky-sparkle"
            viewBox="0 0 10 10"
            style={{ left: `${sp.x}%`, top: `${sp.y}%`, animationDelay: `${sp.d}s` }}
          >
            <path d="M5 0l1.1 3.9L10 5 6.1 6.1 5 10 3.9 6.1 0 5l3.9-1.1Z" />
          </svg>
        ))}
      </div>
    </div>
  );
}
