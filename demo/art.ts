/**
 * Pictures for the demo, drawn from a seed: abstract covers and initials avatars as SVG data URLs.
 * Nothing is downloaded, so the canvas is the same everywhere it runs.
 */

const svg = (body: string, width: number, height: number) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`,
  )}`;

/** A small deterministic random source. */
function random(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${s}% ${l}%)`;

/** An abstract cover: a two-tone gradient with soft glowing shapes and a wave, 800 x 600. */
export function art(seed: number) {
  const next = random(seed + 7);
  const hue = next() * 360;
  const other = hue + 40 + next() * 140;
  const dark = next() < 0.35;
  const W = 800;
  const H = 600;
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const r = 120 + next() * 220;
    const h = i % 2 ? other : hue + next() * 30;
    return `<circle cx="${next() * W}" cy="${next() * H}" r="${r}" fill="${hsl(h, 85, dark ? 55 : 68)}" opacity="${0.55 + next() * 0.4}" filter="url(#b)"/>`;
  }).join('');
  const y = H * (0.55 + next() * 0.25);
  const wave = `<path d="M0 ${y} C ${W * 0.3} ${y - 140 * next()}, ${W * 0.6} ${y + 160 * next()}, ${W} ${y - 60} L${W} ${H} L0 ${H} Z" fill="${hsl(other, 70, dark ? 22 : 88)}" opacity="0.7"/>`;
  return svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 75, dark ? 18 : 82)}"/><stop offset="1" stop-color="${hsl(other, 70, dark ? 30 : 60)}"/></linearGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${blobs}${wave}`,
    W,
    H,
  );
}

/** An avatar: the person's initials on a colour picked from their name, 96 x 96. */
export function avatar(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
  return svg(
    `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 70, 62)}"/><stop offset="1" stop-color="${hsl(hue + 30, 70, 46)}"/></linearGradient></defs><rect width="96" height="96" fill="url(#a)"/><text x="48" y="50" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, system-ui, sans-serif" font-size="38" font-weight="600" fill="white">${initials}</text>`,
    96,
    96,
  );
}
