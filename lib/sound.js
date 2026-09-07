'use client';

// Plays a real audio file through pooled <audio> elements, rather than a
// Web Audio API oscillator. The oscillator approach shipped first and
// worked fine in a normal Safari tab, but went silent specifically once
// the app was installed to the iPhone Home Screen (standalone display
// mode) — a long-standing WebKit quirk where AudioContext output doesn't
// reliably reach the speaker in that mode, even with the ringer on and
// volume up. A real <audio> element played from inside the click handler
// is the standard, more reliable fix.
//
// A small pool per style (rather than one shared element) is used so a
// fast second tap doesn't cut off or restart the first tap's sound — each
// play() call grabs the next element in that style's pool, round-robin.

export const SOUND_STYLES = [
  { id: 'soft', label: 'Soft tap', file: '/sounds/click-soft.wav' },
  { id: 'crisp', label: 'Crisp click', file: '/sounds/click-crisp.wav' },
  { id: 'pop', label: 'Pop', file: '/sounds/click-pop.wav' },
  { id: 'marimba', label: 'Marimba', file: '/sounds/click-marimba.wav' },
];

const DEFAULT_SETTINGS = { enabled: true, volume: 0.6, style: 'soft' };
const STORAGE_KEY = 'buttonSoundSettings';

const POOL_SIZE = 4;
const pools = {}; // styleId -> { elements: HTMLAudioElement[], index: number }

function getPool(styleId) {
  if (typeof window === 'undefined') return null;
  const style = SOUND_STYLES.find(s => s.id === styleId) || SOUND_STYLES[0];
  if (!pools[style.id]) {
    pools[style.id] = {
      elements: Array.from({ length: POOL_SIZE }, () => {
        const audio = new Audio(style.file);
        audio.preload = 'auto';
        return audio;
      }),
      index: 0,
    };
  }
  return pools[style.id];
}

// Called once on app mount so the browser starts fetching/decoding every
// style's (tiny, a few KB each) file right away instead of on first tap.
export function preloadClickSounds() {
  SOUND_STYLES.forEach(s => getPool(s.id));
}

export function getSoundSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      style: SOUND_STYLES.some(s => s.id === parsed.style) ? parsed.style : DEFAULT_SETTINGS.style,
    };
  } catch (err) {
    return DEFAULT_SETTINGS;
  }
}

export function setSoundSettings(partial) {
  const current = getSoundSettings();
  const next = { ...current, ...partial };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    // Private browsing / storage disabled — the choice just won't persist
    // across reloads, which is a fine degradation rather than a crash.
  }
  return next;
}

function play(styleId, volume) {
  const pool = getPool(styleId);
  if (!pool) return;

  const audio = pool.elements[pool.index];
  pool.index = (pool.index + 1) % pool.elements.length;

  audio.volume = volume;
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

// The normal button-tap sound — respects the saved on/off + volume + style.
export function playClickSound() {
  const { enabled, volume, style } = getSoundSettings();
  if (!enabled) return;
  play(style, volume);
}

// Forces a specific style to play at the saved volume regardless of the
// on/off setting, so Settings can preview an option even while muted.
export function previewSound(styleId) {
  const { volume } = getSoundSettings();
  play(styleId, volume);
}
