// Small flat illustrations for the recipe cards, in the same style as the
// Today tiles (lib/homeUi.js FLAT_TILES). Static, hand-written SVG only.
const ART = {
  potato: ['#fbe6cf', '<path d="M10 30c-3-7 4-16 13-18s16 4 15 11-8 13-16 13-10-1-12-6z" fill="#f2a25c"/><path d="M17 22c2 0 3-1 3-2M27 30c1 1 3 1 4 0" stroke="#d07a35" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M33 12c2-4 6-4 7-2-2 1-4 3-5 5" fill="#6fbf9b"/>'],
  bowl: ['#faf0d2', '<path d="M7 24h34c0 9-7 15-17 15S7 33 7 24z" fill="#fff"/><ellipse cx="24" cy="24" rx="17" ry="4" fill="#f2d9a8"/><circle cx="20" cy="23" r="1.6" fill="#c9a06a"/><circle cx="27" cy="24" r="1.6" fill="#c9a06a"/><path d="M34 8l-6 15" stroke="#b88a5a" stroke-width="3" stroke-linecap="round"/>'],
  'bowl-peanut': ['#faf0d2', '<path d="M7 24h34c0 9-7 15-17 15S7 33 7 24z" fill="#fff"/><ellipse cx="24" cy="24" rx="17" ry="4" fill="#e8c08a"/><circle cx="20" cy="23" r="1.6" fill="#b5844e"/><circle cx="27" cy="24" r="1.6" fill="#b5844e"/><path d="M34 8l-6 15" stroke="#b88a5a" stroke-width="3" stroke-linecap="round"/>'],
  avocado: ['#e4f1da', '<path d="M24 6c7 0 13 12 13 22a13 13 0 0 1-26 0C11 18 17 6 24 6z" fill="#6fa86a"/><path d="M24 11c5 0 9 9 9 17a9 9 0 0 1-18 0c0-8 4-17 9-17z" fill="#dceba9"/><circle cx="24" cy="30" r="5" fill="#a0703c"/>'],
  carrot: ['#fde3d2', '<path d="M14 38L30 14l6 6z" fill="#f08a3c"/><path d="M31 15c0-5 2-8 5-9 0 3-1 6-3 8 3-2 6-2 9 0-3 2-6 3-9 3" fill="#6fbf9b"/><circle cx="14" cy="18" r="3" fill="#e26a5a"/><circle cx="20" cy="12" r="2.4" fill="#e9b34a"/><circle cx="10" cy="25" r="2.2" fill="#e26a5a"/>'],
  egg: ['#faf0d2', '<path d="M9 26c0-8 6-13 15-13s15 5 15 13-7 13-15 13S9 34 9 26z" fill="#fff"/><path d="M16 25c2-3 4-1 6-3s4 1 7-1 4 2 3 4-4 1-6 3-5 0-7 0-4-1-3-3z" fill="#f6c94a"/>'],
  banana: ['#fbf2cc', '<path d="M8 30c10 6 24 4 32-12 1 9-6 22-20 22-6 0-10-4-12-10z" fill="#f6d35c"/><path d="M38 17l3-3" stroke="#8a6a3a" stroke-width="2.5" stroke-linecap="round"/>'],
  pancake: ['#fbe6cf', '<ellipse cx="24" cy="34" rx="15" ry="5" fill="#d9a15f"/><ellipse cx="24" cy="28" rx="15" ry="5" fill="#e8b873"/><ellipse cx="24" cy="22" rx="15" ry="5" fill="#f2c98a"/><circle cx="20" cy="21" r="2" fill="#f6d35c"/><circle cx="27" cy="22" r="2" fill="#f6d35c"/>'],
  sticks: ['#e4f1da', '<rect x="10" y="10" width="7" height="28" rx="3.5" fill="#f08a3c" transform="rotate(-12 13 24)"/><rect x="21" y="9" width="7" height="30" rx="3.5" fill="#7dbe7a"/><rect x="32" y="10" width="7" height="28" rx="3.5" fill="#f2c98a" transform="rotate(12 35 24)"/>'],
  balls: ['#f3e3d8', '<circle cx="17" cy="28" r="8" fill="#b07a55"/><circle cx="31" cy="28" r="8" fill="#a06a48"/><circle cx="24" cy="18" r="8" fill="#be8963"/><circle cx="21" cy="16" r="1.5" fill="#7dbe7a"/><circle cx="29" cy="27" r="1.5" fill="#7dbe7a"/>'],
};

export function RecipeArt({ name, size = 'md' }) {
  const [bg, art] = ART[name] || ART.bowl;
  return (
    <span className={`recipe-art recipe-art-${size}`} style={{ background: bg }} aria-hidden="true">
      <svg viewBox="0 0 48 48" dangerouslySetInnerHTML={{ __html: art }} />
    </span>
  );
}
