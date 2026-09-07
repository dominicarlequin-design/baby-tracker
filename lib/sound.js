'use client';

// Plays a real audio file (public/sounds/click.wav) through pooled <audio>
// elements, rather than a Web Audio API oscillator.
//
// The oscillator approach shipped first and worked fine in a normal Safari
// tab, but went silent specifically once the app was installed to the
// iPhone Home Screen (standalone display mode) — a long-standing WebKit
// quirk where AudioContext output doesn't reliably reach the speaker in
// that mode, even with the ringer on and volume up. A real <audio> element
// played from inside the click handler is the standard, more reliable fix.
//
// A small pool (rather than one shared element) is used so a fast second
// tap doesn't cut off or restart the first tap's sound — each play() call
// grabs the next element in round-robin order.
const POOL_SIZE = 4;
let pool = null;
let poolIndex = 0;

function getPool() {
  if (typeof window === 'undefined') return null;
  if (!pool) {
    pool = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio('/sounds/click.wav');
      audio.preload = 'auto';
      audio.volume = 0.6;
      return audio;
    });
  }
  return pool;
}

// Called once on app mount so the browser starts fetching/decoding the
// (tiny, ~8KB) click file right away instead of on the very first tap.
export function preloadClickSound() {
  getPool();
}

export function playClickSound() {
  const elements = getPool();
  if (!elements) return;

  const audio = elements[poolIndex];
  poolIndex = (poolIndex + 1) % elements.length;

  try {
    audio.currentTime = 0;
  } catch (err) {
    // Some browsers throw if the element hasn't loaded enough data yet —
    // harmless, play() below still works from the start either way.
  }

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {});
  }
}
