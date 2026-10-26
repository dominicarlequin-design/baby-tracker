'use client';

// App skins: a color set for the whole app (accent, borders, tab bar, and
// the dark-mode night sky). Picked per phone in Profile → App look and
// kept in localStorage, like the light/dark choice. The colors themselves
// live in app/globals.css under "Skins" ([data-skin] on <html>); Blossom
// is the original look and needs no attribute.

export const SKINS = [
  { id: 'blossom', name: 'Blossom', note: 'Pink & twilight violet', swatch: ['#d6207a', '#fbe3ee', '#1c1340'] },
  { id: 'moonlight', name: 'Moonlight', note: 'Periwinkle & night blue', swatch: ['#4f5fc4', '#e6e9fb', '#142049'] },
  { id: 'sage', name: 'Sage', note: 'Soft green & forest', swatch: ['#2f7d5b', '#e2f1e8', '#12251d'] },
  { id: 'sunset', name: 'Sunset', note: 'Coral & dusk plum', swatch: ['#c94a22', '#fde8de', '#2a1520'] },
];

const KEY = 'skin';

export function getSkin() {
  try {
    const s = localStorage.getItem(KEY);
    return SKINS.some(k => k.id === s) ? s : 'blossom';
  } catch (e) {
    return 'blossom';
  }
}

export function applySkin(id) {
  const root = document.documentElement;
  if (!id || id === 'blossom') root.removeAttribute('data-skin');
  else root.setAttribute('data-skin', id);
  try { localStorage.setItem(KEY, id); } catch (e) {}
}

// Light / dark / match the phone. Same storage key the header toggle uses.
export function getMode() {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch (e) {
    return 'auto';
  }
}

export function applyMode(mode) {
  const root = document.documentElement;
  try {
    if (mode === 'auto') { localStorage.removeItem('theme'); root.removeAttribute('data-theme'); }
    else { localStorage.setItem('theme', mode); root.setAttribute('data-theme', mode); }
  } catch (e) {
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  }
}
