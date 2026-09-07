'use client';

// Synthesized via the Web Audio API rather than an audio file — a couple
// lines of code instead of an asset to source, host, and keep in sync with
// the app's theme, and it starts instantly since there's no file to fetch.
let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

// A short, soft "tap" — quick attack/decay so it never feels laggy behind
// the tap, and pitched/quiet enough to read as a UI click rather than an
// alert (that's reserved for the overdue banner and phone push).
export function playClickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Browsers suspend a freshly-created AudioContext until a user gesture;
  // this call itself always runs from inside a real click, so resuming
  // here is safe (including on iOS Safari, which is strict about this).
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(720, now);
  osc.frequency.exponentialRampToValueAtTime(340, now + 0.05);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}
