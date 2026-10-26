'use client';

import { useEffect, useState } from 'react';

// Quiet line-art layer behind Today. No glow, no color tint: everything is
// thin outlines on the plain page background.
//
// Three pieces:
// 1. Doodles: tiny bottle / moon / heart / star outlines repeating like
//    wrapping paper. They only show in the gaps between cards, start below
//    the header and fade out toward the bottom (mask in globals.css).
// 2. Sun or moon (SkyGlyph below): a small icon inline after the date,
//    sun during the day and a crescent moon in the evening and overnight,
//    by the baby's local time. It lives with the date, away from the
//    calendar button, so it never reads as a tappable control.
// 3. Constellation: a small dotted "W" in the header that fades in only
//    while she's napping or asleep, plus a few faint stars in the side
//    margins.
//
// Purely decorative: aria-hidden, pointer-events off, sits behind content.
// Line color follows the theme through currentColor (see .sky in
// globals.css). Star breathing turns off under "Reduce Motion".

// Fractional local hour (e.g. 17.5 for 5:30 PM) in the baby's timezone.
function localHour(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h + m / 60;
}

// Sun from 6 AM until 5:30 PM, moon the rest of the time.
const isDaytime = hour => hour >= 6 && hour < 17.5;

// Line-art scene for the open space under Today's buttons: rolling hills
// with clouds and birds by day, a sleepy crescent moon with clouds and
// sparkles at night (same 6 AM / 5:30 PM switch as the sun and moon by the
// date). Thin lines only, in the doodles' color; nothing to tap.
const cloud = (x, y, s = 1) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 20h46a10 10 0 0 0 0-20 13 13 0 0 0-24-6A10 10 0 0 0 4 4 8 8 0 0 0 0 20z" />;
const sparkle = (x, y, r) => <path d={`M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`} />;
const bird = (x, y) => <path d={`M${x} ${y}q5 -5 9 0q4 -5 9 0`} />;

const HILLS = (
  <>
    <path d="M-10 118C40 84 92 84 150 104S250 82 310 106" />
    <path d="M-10 128C60 104 120 108 170 120S260 110 310 122" opacity=".7" />
    {cloud(34, 30, 0.95)}
    {cloud(212, 14, 0.75)}
    {bird(120, 34)}
    {bird(140, 26)}
  </>
);

const MOON = (
  <>
    <path d="M168 18a40 40 0 1 0 34 62A32 32 0 0 1 168 18z" />
    <path d="M150 58q5 5 10 0" />
    {cloud(96, 86, 0.9)}
    {cloud(186, 92, 0.7)}
    {sparkle(70, 30, 6)}
    {sparkle(236, 26, 5)}
    {sparkle(250, 70, 4)}
    {sparkle(52, 76, 4)}
    <circle cx="110" cy="40" r="1.6" />
    <circle cx="214" cy="52" r="1.6" />
    <circle cx="90" cy="60" r="1.4" />
  </>
);

export function BottomScene({ now, timezone }) {
  const day = isDaytime(localHour(now, timezone));
  return (
    <div className="today-scene" aria-hidden="true">
      <svg
        className={`today-scene-art ${day ? 'is-day' : 'is-night'}`}
        viewBox="0 0 300 130"
        preserveAspectRatio="xMidYMax meet"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {day ? HILLS : MOON}
      </svg>
    </div>
  );
}

// Side-margin stars (percent of the top area). Fixed so they don't jump on
// the page's 10-second re-render; each breathes on its own slow cycle.
const STARS = [
  { x: 3, y: 44, s: 2, d: 1.8, dur: 11 },
  { x: 97, y: 53, s: 2.5, d: 4.4, dur: 9.5 },
  { x: 2.5, y: 71, s: 2, d: 7.0, dur: 10.5 },
  { x: 97.5, y: 82, s: 2, d: 2.6, dur: 8.5 },
];

// Constellation points inside its 92x60 box.
const CONSTELLATION = [[4, 52], [24, 28], [46, 44], [68, 20], [88, 38]];
const CONSTELLATION_PATH = CONSTELLATION.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return `M${(16 + 10 * c).toFixed(1)} ${(16 + 10 * s).toFixed(1)}L${(16 + 14 * c).toFixed(1)} ${(16 + 14 * s).toFixed(1)}`;
}).join('');

function SunOrMoon({ day, className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {day ? (
        <>
          <circle cx="16" cy="16" r="6.5" />
          <path d={SUN_RAYS} />
        </>
      ) : (
        <>
          <path d="M19 4A12 12 0 1 0 28.5 22.5A9.5 9.5 0 1 1 19 4Z" />
          <path d="M27 6.5L27.8 8.7L30 9.5L27.8 10.3L27 12.5L26.2 10.3L24 9.5L26.2 8.7Z" strokeWidth="0.9" />
        </>
      )}
    </svg>
  );
}

function Doodles() {
  return (
    <svg className="sky-doodles" width="100%" height="100%">
      <defs>
        <pattern id="sky-doodle-tile" width="112" height="112" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <g transform="translate(14 14) rotate(-12 6 12)">
              <rect x="1" y="7" width="10" height="15" rx="3" />
              <path d="M3.5 7V4.5Q6 0.5 8.5 4.5V7M0.5 7H11.5M3 12H5.5M3 16H5.5" />
            </g>
            <g transform="translate(66 12) rotate(10 8 8)">
              <path d="M10 1.5A7.5 7.5 0 1 0 15.5 13A6 6 0 1 1 10 1.5Z" />
            </g>
            <g transform="translate(20 66) rotate(-8 8 8)">
              <path d="M8 14C2.5 9.5 0.5 6.5 2.3 3.6C4 1.2 6.8 1.8 8 4C9.2 1.8 12 1.2 13.7 3.6C15.5 6.5 13.5 9.5 8 14Z" />
            </g>
            <g transform="translate(72 68) rotate(14 7 7)">
              <path d="M7 0.8L8.4 5.6L13.2 7L8.4 8.4L7 13.2L5.6 8.4L0.8 7L5.6 5.6Z" />
            </g>
          </g>
          <circle cx="52" cy="50" r="0.9" fill="currentColor" />
          <circle cx="100" cy="98" r="0.9" fill="currentColor" />
          <circle cx="104" cy="44" r="0.9" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sky-doodle-tile)" />
    </svg>
  );
}

export function SkyBackdrop({ now, timezone, asleep }) {
  // Drawn only after mount: the server renders with its own clock, so a
  // server-side sun/moon could be the wrong one until the next re-render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <div className="sky" aria-hidden="true">
      <Doodles />
      <div className="sky-head">
        <svg className={`sky-constellation ${asleep ? 'is-on' : ''}`} viewBox="0 0 92 60" width="92" height="60">
          <path d={CONSTELLATION_PATH} fill="none" stroke="currentColor" strokeWidth="0.8"
            strokeLinecap="round" strokeDasharray="0.1 3.2" opacity="0.4" />
          <path d={CONSTELLATION_PATH} fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.18" />
          {CONSTELLATION.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 3 ? 1.6 : 1.2} fill="currentColor" />
          ))}
        </svg>
      </div>
      <div className={`sky-stars ${asleep ? 'is-on' : ''}`}>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="sky-star"
            style={{
              left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s,
              animationDelay: `${st.d}s`, animationDuration: `${st.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Small sun/moon shown inline after the date on Today. Drawn only after
// mount for the same reason as the backdrop (server clock vs. local time).
export function SkyGlyph({ now, timezone }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <SunOrMoon day={isDaytime(localHour(now, timezone))} className="sky-glyph" />;
}
