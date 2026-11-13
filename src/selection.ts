import { screenToWorld, type Point, type Rect } from './camera';
import type { GpuCanvas } from './types';

/**
 * What a click selects: the whole node, the exact element under the pointer, or what a function
 * returns for that element, such as its closest `[data-component]` ancestor.
 */
export type SelectionPick =
  'node' | 'element' | ((element: Element, canvas: GpuCanvas) => Element | Element[] | null);

export interface SelectionOptions {
  /** Default `'node'`. */
  pick?: SelectionPick;
  /**
   * `'shift-click'` (default): clicks still reach the components, shift-click selects.
   * `'click'`: every click selects, an edit mode; shift-click adds or removes.
   */
  trigger?: 'shift-click' | 'click';
  /** Outlines what a click would select under the pointer. With `'shift-click'`, only while shift is held. Default true. */
  hover?: boolean;
  /** Shift-drag draws a box that selects the nodes it touches. Default true. */
  marquee?: boolean;
  /** Called with the new selection after every change. */
  onChange?: (selected: Element[]) => void;
}

export interface Selection {
  get(): Element[];
  set(elements: Iterable<Element>): void;
  clear(): void;
  /** Removes the listeners and the outlines. */
  destroy(): void;
}

type MarqueeCanvas = Pick<GpuCanvas, 'surface' | 'getCamera' | 'getNodesIn' | 'setSelection'>;

/**
 * A selection box over the canvas, in surface pixels. Every node it overlaps is selected as it
 * grows, so the outlines sweep across the canvas with it.
 */
export function createMarquee(canvas: MarqueeCanvas, color = '#4f8cff') {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    border: `1px solid ${color}`,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    zIndex: '1',
  });
  canvas.surface.append(box);
  return {
    /** Spans the box from `a` to `b` and selects the nodes it covers. */
    update(a: Point, b: Point): HTMLElement[] {
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
        ...screenToWorld(camera, { x, y }),
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

/** How far a press may move and still count as a click, in CSS pixels. */
const CLICK_SLOP = 4;

/**
 * Click, hover and box selection for a canvas. The selection is outlined by the canvas itself; a
 * click on the background or Escape clears it.
 */
export function bindSelection(canvas: GpuCanvas, options: SelectionOptions = {}): Selection {
  const {
    pick = 'node',
    trigger = 'shift-click',
    hover = true,
    marquee = true,
    onChange,
  } = options;
  const { surface } = canvas;
  const box = marquee ? createMarquee(canvas) : null;
  let selection: Element[] = [];
  let press: { start: Point; additive: boolean; dragged: boolean } | null = null;
  let pointer: Point | null = null;
  let shift = false;
  let swallowClick = false;

  const commit = (next: Iterable<Element>) => {
    selection = [...new Set(next)];
    canvas.setSelection(selection);
    onChange?.(selection);
  };
  const at = (event: MouseEvent): Point => {
    const bounds = surface.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  /** What a click at `point` (surface pixels) selects, or [] for the background. */
  const resolve = (point: Point): Element[] => {
    const element = canvas.getElementAt(canvas.screenToWorld(point));
    if (!element) return [];
    const picked =
      pick === 'node'
        ? canvas.getNodeOf(element)
        : pick === 'element'
          ? element
          : pick(element, canvas);
    return picked ? [picked].flat() : [];
  };
  const selecting = (withShift: boolean) => trigger === 'click' || withShift;
  const updateHover = () => {
    const target = hover && pointer && !press && selecting(shift) ? resolve(pointer)[0] : null;
    canvas.setHover(target ?? null);
  };

  const onPointerDown = (event: PointerEvent) => {
    shift = event.shiftKey;
    swallowClick = false;
    if (event.button !== 0) return;
    const point = at(event);
    const world = canvas.screenToWorld(point);
    const onBackground = canvas.getNodesIn({ ...world, width: 0, height: 0 }).length === 0;
    // A plain press on the background clears, and still pans the camera.
    if (!event.shiftKey && onBackground) {
      if (selection.length) commit([]);
      return;
    }
    if (!selecting(event.shiftKey)) return;
    // The component under the pointer never sees this press, nor the click it ends in.
    event.stopPropagation();
    swallowClick = true;
    press = { start: point, additive: event.shiftKey, dragged: false };
    surface.setPointerCapture(event.pointerId);
    canvas.setHover(null);
  };
  const onPointerMove = (event: PointerEvent) => {
    shift = event.shiftKey;
    pointer = at(event);
    if (!press) return updateHover();
    press.dragged ||= Math.hypot(pointer.x - press.start.x, pointer.y - press.start.y) > CLICK_SLOP;
    if (press.dragged && press.additive && box) {
      selection = box.update(press.start, pointer);
      onChange?.(selection);
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!press) return;
    const { additive, dragged } = press;
    press = null;
    box?.hide();
    if (!dragged) {
      const picked = resolve(at(event));
      if (!additive) commit(picked);
      else if (picked.length && picked.every((element) => selection.includes(element)))
        commit(selection.filter((element) => !picked.includes(element)));
      else commit([...selection, ...picked]);
    }
    updateHover();
  };
  const onPointerLeave = () => {
    pointer = null;
    canvas.setHover(null);
  };
  // A shift-press would otherwise extend the page's text selection across components.
  const onMouseDown = (event: MouseEvent) => {
    if (!swallowClick) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onClick = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && event.type === 'keydown' && selection.length) commit([]);
    if (event.key === 'Shift') {
      shift = event.type === 'keydown';
      updateHover();
    }
  };

  surface.addEventListener('pointerdown', onPointerDown, true);
  surface.addEventListener('mousedown', onMouseDown, true);
  surface.addEventListener('click', onClick, true);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  return {
    get: () => selection,
    set: commit,
    clear: () => commit([]),
    destroy() {
      surface.removeEventListener('pointerdown', onPointerDown, true);
      surface.removeEventListener('mousedown', onMouseDown, true);
      surface.removeEventListener('click', onClick, true);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      box?.remove();
      canvas.setHover(null);
      canvas.setSelection([]);
    },
  };
}
