import type { Rect } from './camera';

/** A line drawn while something snaps, in world units. */
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Fractions of a rect's width or height that snap: its start, middle and end. */
export const ALL_ANCHORS = [0, 0.5, 1];

const anchorsX = (rect: Rect) => ALL_ANCHORS.map((f) => rect.x + rect.width * f);
const anchorsY = (rect: Rect) => ALL_ANCHORS.map((f) => rect.y + rect.height * f);

/** The smallest shift within `threshold` that lines one of `moving` up with one of `lines`. */
function nearest(moving: number[], lines: number[], threshold: number): number {
  let best = Infinity;
  for (const from of moving) {
    for (const to of lines) {
      const delta = to - from;
      if (Math.abs(delta) <= threshold && Math.abs(delta) < Math.abs(best)) best = delta;
    }
  }
  return best === Infinity ? 0 : best;
}

/**
 * How far to shift `rect` so the anchors listed in `edges` (fractions of its width and height)
 * line up with the start, middle or end of a target, and the guides that show it.
 */
export function snapRect(
  rect: Rect,
  targets: readonly Rect[],
  threshold: number,
  edges: { x: number[]; y: number[] } = { x: ALL_ANCHORS, y: ALL_ANCHORS },
): { dx: number; dy: number; guides: Guide[] } {
  const xs = targets.flatMap(anchorsX);
  const ys = targets.flatMap(anchorsY);
  const dx = nearest(
    edges.x.map((f) => rect.x + rect.width * f),
    xs,
    threshold,
  );
  const dy = nearest(
    edges.y.map((f) => rect.y + rect.height * f),
    ys,
    threshold,
  );
  const moved = { ...rect, x: rect.x + dx, y: rect.y + dy };
  return { dx, dy, guides: guidesFor(moved, targets, edges) };
}

/** One line per aligned position, spanning the moved rect and every target on it. */
function guidesFor(rect: Rect, targets: readonly Rect[], edges: { x: number[]; y: number[] }) {
  const guides: Guide[] = [];
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  for (const f of edges.x) {
    const x = rect.x + rect.width * f;
    const hits = targets.filter((target) => anchorsX(target).some((at) => close(at, x)));
    if (!hits.length) continue;
    const top = Math.min(rect.y, ...hits.map((t) => t.y));
    const bottom = Math.max(rect.y + rect.height, ...hits.map((t) => t.y + t.height));
    guides.push({ x1: x, y1: top, x2: x, y2: bottom });
  }
  for (const f of edges.y) {
    const y = rect.y + rect.height * f;
    const hits = targets.filter((target) => anchorsY(target).some((at) => close(at, y)));
    if (!hits.length) continue;
    const left = Math.min(rect.x, ...hits.map((t) => t.x));
    const right = Math.max(rect.x + rect.width, ...hits.map((t) => t.x + t.width));
    guides.push({ x1: left, y1: y, x2: right, y2: y });
  }
  return guides;
}
