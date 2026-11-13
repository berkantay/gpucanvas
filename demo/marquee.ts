import type { Rect } from '../src/index';
import type { Stage } from './stage';

export interface Point {
  x: number;
  y: number;
}

/**
 * A selection box over the canvas, in screen pixels. Every node it overlaps is selected as it
 * grows, so the outlines sweep across the canvas with it.
 */
export function createMarquee(canvas: Stage) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    border: '1px solid #4f8cff',
    background: 'rgb(79 140 255 / 0.12)',
    zIndex: '1',
  });
  canvas.surface.append(box);
  return {
    /** Spans the box from `a` to `b` (surface pixels) and selects what it covers. */
    update(a: Point, b: Point) {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const width = Math.abs(b.x - a.x);
      const height = Math.abs(b.y - a.y);
      Object.assign(box.style, {
        display: 'block',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const camera = canvas.getCamera();
      const world: Rect = {
        x: camera.x + x / camera.zoom,
        y: camera.y + y / camera.zoom,
        width: width / camera.zoom,
        height: height / camera.zoom,
      };
      const hits = canvas.getNodesIn(world);
      canvas.setSelection(hits);
      return hits;
    },
    hide() {
      box.style.display = 'none';
    },
    remove() {
      box.remove();
    },
  };
}

/**
 * Shift-click selects a component, or adds it to the selection, or takes it out again. Shift-drag
 * draws a selection box, over components too: zoomed out, nearly every point is one. A click on
 * the background or Escape clears the selection.
 */
export function bindMarquee(canvas: Stage): () => void {
  const marquee = createMarquee(canvas);
  const { surface } = canvas;
  let start: Point | null = null;
  let dragged = false;
  let selection = new Set<HTMLElement>();
  const select = (next: Iterable<HTMLElement>) => {
    selection = new Set(next);
    canvas.setSelection(selection);
  };
  const at = (event: PointerEvent) => {
    const bounds = surface.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const onBackground = (event: Event) =>
    event.target === surface || (event.target as Element).hasAttribute?.('data-gpucanvas-surface');
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (!event.shiftKey) {
      if (onBackground(event)) select([]);
      return;
    }
    // The component under the pointer never sees this press.
    event.stopPropagation();
    start = at(event);
    dragged = false;
    surface.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!start) return;
    const point = at(event);
    dragged ||= Math.hypot(point.x - start.x, point.y - start.y) > 4;
    if (dragged) selection = new Set(marquee.update(start, point));
  };
  const onUp = (event: PointerEvent) => {
    if (!start) return;
    start = null;
    marquee.hide();
    if (dragged) return;
    // A click: the smallest component under the pointer, the one drawn on top.
    const camera = canvas.getCamera();
    const { x, y } = at(event);
    const point = {
      x: camera.x + x / camera.zoom,
      y: camera.y + y / camera.zoom,
      width: 0,
      height: 0,
    };
    const area = (element: HTMLElement) => {
      const rect = canvas.getNodeRect(element)!;
      return rect.width * rect.height;
    };
    const hit = canvas.getNodesIn(point).sort((a, b) => area(a) - area(b))[0];
    if (!hit) return;
    if (selection.has(hit)) selection.delete(hit);
    else selection.add(hit);
    select(selection);
  };
  // A shift-press would otherwise extend the page's text selection across components.
  const onMouseDown = (event: MouseEvent) => {
    if (event.shiftKey) event.preventDefault();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') select([]);
  };
  surface.addEventListener('pointerdown', onDown, true);
  surface.addEventListener('mousedown', onMouseDown, true);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    surface.removeEventListener('pointerdown', onDown, true);
    surface.removeEventListener('mousedown', onMouseDown, true);
    surface.removeEventListener('pointermove', onMove);
    surface.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
}
