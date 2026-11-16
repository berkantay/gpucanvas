import { describe, expect, test } from 'bun:test';
import {
  center,
  contains,
  containsPoint,
  intersection,
  intersects,
  sameRect,
  unionOf,
  type Rect,
} from './rect';

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('center', () => {
  test('is the midpoint of the rect', () => {
    expect(center(rect(0, 0, 10, 20))).toEqual({ x: 5, y: 10 });
  });
});

describe('containsPoint', () => {
  test('includes the top-left corner but excludes the bottom-right one', () => {
    const r = rect(0, 0, 10, 10);
    expect(containsPoint(r, { x: 0, y: 0 })).toBe(true);
    expect(containsPoint(r, { x: 9.999, y: 9.999 })).toBe(true);
    expect(containsPoint(r, { x: 10, y: 10 })).toBe(false);
  });

  test('rejects points outside the rect', () => {
    expect(containsPoint(rect(0, 0, 10, 10), { x: -1, y: 5 })).toBe(false);
  });
});

describe('intersects', () => {
  test('is true for overlapping rects', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
  });

  test('is false for rects that only touch at an edge', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });

  test('is false for disjoint rects', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBe(false);
  });
});

describe('intersection', () => {
  test('returns the overlapping area', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toEqual(rect(5, 5, 5, 5));
  });

  test('returns null when the rects only touch at an edge', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBeNull();
  });

  test('returns null for disjoint rects', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBeNull();
  });
});

describe('contains', () => {
  test('is true when inner sits entirely inside outer, edges included', () => {
    expect(contains(rect(0, 0, 10, 10), rect(0, 0, 10, 10))).toBe(true);
    expect(contains(rect(0, 0, 10, 10), rect(2, 2, 5, 5))).toBe(true);
  });

  test('is false when inner spills past outer', () => {
    expect(contains(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(false);
  });
});

describe('unionOf', () => {
  test('returns null for an empty or all-null iterable', () => {
    expect(unionOf([])).toBeNull();
    expect(unionOf([null, null])).toBeNull();
  });

  test('returns the one rect unchanged, not a recomputed copy', () => {
    const only = rect(1, 2, 3, 4);
    expect(unionOf([null, only])).toBe(only);
  });

  test('is the smallest rect spanning every input, skipping nulls', () => {
    const union = unionOf([rect(0, 0, 10, 10), null, rect(20, 5, 10, 10)]);
    expect(union).toEqual(rect(0, 0, 30, 15));
  });
});

describe('sameRect', () => {
  test('is true within half a pixel on every side', () => {
    expect(sameRect(rect(0, 0, 10, 10), rect(0.4, -0.4, 10.4, 9.6))).toBe(true);
  });

  test('is false at or past half a pixel off', () => {
    expect(sameRect(rect(0, 0, 10, 10), rect(0.5, 0, 10, 10))).toBe(false);
  });

  test('is false when either side is null', () => {
    expect(sameRect(null, rect(0, 0, 1, 1))).toBe(false);
    expect(sameRect(rect(0, 0, 1, 1), null)).toBe(false);
  });
});
