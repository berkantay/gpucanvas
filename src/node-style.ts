import type { Rect } from './camera';

/** Sizes a node's element; containment keeps one node's changes from relaying out the others. */
export function applyNodeSize(element: HTMLElement, rect: Rect) {
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

export function applyNodeBase(element: HTMLElement) {
  element.style.boxSizing = 'border-box';
  element.style.contain = 'strict';
  element.style.overflow = 'hidden';
}

export function boundsOf(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
