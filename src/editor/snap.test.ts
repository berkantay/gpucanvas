import { describe, expect, test } from 'bun:test';
import { snapRect } from './snap';
import type { Rect } from '../core/rect';

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('snapRect', () => {
  test('snaps a left edge to a target within threshold', () => {
    const moving = rect(103, 0, 50, 50);
    const target = rect(100, 200, 50, 50);
    const { dx, dy } = snapRect(moving, [target], 10);
    expect(dx).toBe(-3);
    expect(dy).toBe(0);
  });

  test('does nothing past the threshold', () => {
    const moving = rect(120, 0, 50, 50);
    const target = rect(500, 500, 50, 50);
    const { dx, dy, guides } = snapRect(moving, [target], 10);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
    expect(guides).toEqual([]);
  });

  test('picks the closest anchor, not just the first within threshold', () => {
    // The moving rect's left edge (x=103) is 3px from the target's left (100) and would also be
    // within threshold of a target placed near its right edge; the smaller shift must win.
    const moving = rect(103, 0, 50, 50);
    const near = rect(100, 0, 50, 50);
    const far = rect(108, 0, 50, 50);
    const { dx } = snapRect(moving, [near, far], 10, { x: [0], y: [] });
    expect(dx).toBe(-3);
  });

  test('returns a guide spanning the moved rect and the target it aligned to', () => {
    const moving = rect(100, 0, 50, 50);
    const target = rect(100, 200, 50, 50);
    const { guides } = snapRect(moving, [target], 10, { x: [0], y: [] });
    expect(guides).toHaveLength(1);
    expect(guides[0]).toEqual({ x1: 100, y1: 0, x2: 100, y2: 250 });
  });
});
