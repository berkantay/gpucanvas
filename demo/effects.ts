import { effects, type Effect } from '../src/index';

/** The effects the demo offers, for every component at once. */
export const DEMO_EFFECTS = {
  glass: { label: 'Glass', effect: effects.glass },
  shockwave: { label: 'Shockwave', effect: effects.shockwave },
  glitch: { label: 'Glitch', effect: effects.glitch },
  vhs: { label: 'VHS', effect: effects.vhs },
  frost: { label: 'Frost', effect: effects.frost },
  dither: { label: 'Dither', effect: effects.dither },
  glow: { label: 'Glow', effect: effects.glow },
  hue: { label: 'Hue', effect: effects.hue },
  ripple: { label: 'Ripple', effect: effects.ripple },
  blur: { label: 'Blur', effect: effects.blur },
  pixelate: { label: 'Pixelate', effect: effects.pixelate },
  grayscale: { label: 'Grayscale', effect: effects.grayscale },
} satisfies Record<string, { label: string; effect: Effect }>;

export type DemoEffect = keyof typeof DEMO_EFFECTS;

export const parseEffect = (value: string | null): DemoEffect | null =>
  value && value in DEMO_EFFECTS ? (value as DemoEffect) : null;
