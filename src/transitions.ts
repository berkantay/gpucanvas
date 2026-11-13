import { dissolve, type Effect } from './effects';
import type { GpuCanvas } from './types';

export type Easing = (t: number) => number;

export const easeInOut: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface AnimateEffectOptions {
  /** Progress at the start and the end, 0 (whole) to 1 (gone). Default 0 to 1. */
  from?: number;
  to?: number;
  /** Milliseconds. Default 500. */
  duration?: number;
  easing?: Easing;
  /** The effect's other parameters, after progress. */
  params?: readonly number[];
}

/** The animation running on each node, so a new one replaces it. */
const running = new WeakMap<HTMLElement, () => void>();

/**
 * Runs a transition effect (one whose first parameter is progress, such as dissolve, fade or
 * wipe) on a node. Resolves true when it finishes, false when another animation on the same node
 * replaced it. A node that ends whole (progress 0) loses the effect; one that ends gone keeps it,
 * so it stays hidden until it is removed or animated back.
 */
export function animateEffect(
  canvas: Pick<GpuCanvas, 'setEffect'>,
  node: HTMLElement,
  effect: Effect,
  { from = 0, to = 1, duration = 500, easing = easeInOut, params = [] }: AnimateEffectOptions = {},
): Promise<boolean> {
  running.get(node)?.();
  return new Promise((resolve) => {
    const start = performance.now();
    let frame = 0;
    const set = (progress: number) => canvas.setEffect(node, effect, [progress, ...params]);
    const stop = () => {
      cancelAnimationFrame(frame);
      running.delete(node);
      resolve(false);
    };
    running.set(node, stop);
    const step = (now: number) => {
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      const progress = from + (to - from) * easing(t);
      if (t < 1) {
        set(progress);
        frame = requestAnimationFrame(step);
        return;
      }
      running.delete(node);
      if (to === 0) canvas.setEffect(node, null);
      else set(to);
      resolve(true);
    };
    set(from);
    frame = requestAnimationFrame(step);
  });
}

/**
 * Takes `outgoing` away and brings `incoming` in at the same time, each through `effect`.
 * `incoming` ends whole; `outgoing` ends hidden, ready to be removed.
 */
export async function swapNodes(
  canvas: Pick<GpuCanvas, 'setEffect'>,
  outgoing: HTMLElement,
  incoming: HTMLElement,
  {
    effect = dissolve,
    ...options
  }: Omit<AnimateEffectOptions, 'from' | 'to'> & {
    effect?: Effect;
  } = {},
): Promise<boolean> {
  const done = await Promise.all([
    animateEffect(canvas, outgoing, effect, { ...options, from: 0, to: 1 }),
    animateEffect(canvas, incoming, effect, { ...options, from: 1, to: 0 }),
  ]);
  return done.every(Boolean);
}
