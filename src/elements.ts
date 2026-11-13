import type { Point, Rect } from './camera';

/*
 * Elements inside nodes. A node's layout stays current even while its page is parked, so an
 * element's box relative to its node, scaled by the node's world size, is its place in the world.
 * The scale also cancels whatever transform the backend puts on the node.
 */

/** Where `element`, inside the node `node` placed at `nodeRect`, sits in world units. */
export function rectInNode(node: HTMLElement, nodeRect: Rect, element: Element): Rect {
  if (element === node) return { ...nodeRect };
  const outer = node.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  const scale = outer.width > 0 ? nodeRect.width / outer.width : 1;
  return {
    x: nodeRect.x + (inner.left - outer.left) * scale,
    y: nodeRect.y + (inner.top - outer.top) * scale,
    width: inner.width * scale,
    height: inner.height * scale,
  };
}

/**
 * The deepest element of `node` under the world point `point`. It descends through the children
 * whose boxes hold the point, the last one first, since later siblings paint on top.
 */
export function elementInNode(node: HTMLElement, nodeRect: Rect, point: Point): Element {
  const outer = node.getBoundingClientRect();
  const scale = nodeRect.width > 0 ? outer.width / nodeRect.width : 1;
  const x = outer.left + (point.x - nodeRect.x) * scale;
  const y = outer.top + (point.y - nodeRect.y) * scale;
  let hit: Element = node;
  descend: for (;;) {
    for (let child = hit.lastElementChild; child; child = child.previousElementSibling) {
      const box = child.getBoundingClientRect();
      if (
        box.width > 0 &&
        box.height > 0 &&
        x >= box.left &&
        x < box.right &&
        y >= box.top &&
        y < box.bottom
      ) {
        hit = child;
        continue descend;
      }
    }
    return hit;
  }
}

/** The node that holds `element`: the element itself or its nearest ancestor in `nodes`. */
export function nodeOfElement<T>(nodes: Map<HTMLElement, T>, element: Element): HTMLElement | null {
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (nodes.has(at as HTMLElement)) return at as HTMLElement;
  }
  return null;
}
