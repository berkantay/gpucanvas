import { createBase, type BaseNode } from '../core/base';
import { markSurface } from '../core/input';
import type { Camera } from '../core/camera';
import { effectParams, type Effect } from '../features/effects';
import { nodeOfElement, rectInNode } from '../core/elements';
import { intersects, type Rect } from '../core/rect';
import {
  DEFAULT_SELECTION_COLOR,
  HOVER_WIDTH,
  SELECTION_WIDTH,
  type GpuCanvas,
  type GpuCanvasOptions,
} from '../types';

/**
 * The fallback, and the way most infinite canvases work today: every node is absolutely
 * positioned inside one world element that the camera moves with a CSS transform.
 */
export function createDomCanvas(host: HTMLElement, options: GpuCanvasOptions): GpuCanvas {
  let frameMs = 0;
  const apply = (camera: Camera) => {
    const start = performance.now();
    world.style.transform = `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;
    world.style.setProperty('--gpucanvas-zoom', String(camera.zoom));
    frameMs = performance.now() - start;
  };
  const place = (element: HTMLElement, rect: Rect) => {
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  };
  const base = createBase<BaseNode>(host, options, apply, {
    add(element, rect) {
      element.style.position = 'absolute';
      place(element, rect);
      world.append(element);
      return { element, rect };
    },
    update(node, rect) {
      node.rect = rect;
      place(node.element, rect);
    },
    remove({ element }) {
      clearEffect(element);
      selection.delete(element);
      outlinedNodes.delete(element);
      element.style.outline = '';
    },
  });
  const { surface, nodes } = base;
  surface.style.background = options.background ?? 'transparent';
  const world = document.createElement('div');
  markSurface(world);
  Object.assign(world.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    transformOrigin: '0 0',
    willChange: 'transform',
  });
  // Outlines of elements inside nodes, above every node.
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'absolute', left: '0', top: '0', zIndex: '1' });
  world.append(overlay);
  surface.append(world);

  // Outlines live inside the zoomed world, so their width divides the zoom back out.
  const ring = (color: string, width: number) =>
    `calc(${width}px / var(--gpucanvas-zoom)) solid ${color}`;
  const selectionColor = options.selectionColor ?? DEFAULT_SELECTION_COLOR;
  const selectionRing = ring(selectionColor, SELECTION_WIDTH);
  const hoverRing = ring(options.hoverColor ?? selectionColor, HOVER_WIDTH);
  let selection = new Set<Element>();
  let hovered: Element | null = null;
  /** Nodes wearing an outline, and boxes standing in for the outlines of elements inside nodes. */
  let outlinedNodes = new Set<HTMLElement>();
  const boxes = new Map<Element, HTMLElement>();
  const elementRect = (element: Element): Rect | null => {
    const node = element.isConnected ? nodeOfElement(nodes, element) : null;
    return node ? rectInNode(node, nodes.get(node)!.rect, element) : null;
  };
  // Boxes follow their elements' layout every frame while there are any.
  let boxFrame = 0;
  const placeBoxes = () => {
    boxFrame = boxes.size ? requestAnimationFrame(placeBoxes) : 0;
    for (const [element, box] of boxes) {
      const rect = elementRect(element);
      box.style.display = rect ? 'block' : 'none';
      if (rect) {
        box.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
      }
    }
  };
  /** Nodes `snapshotFallback` is drawing now, once for each snapshot under way. */
  const capturing: HTMLElement[] = [];
  const drawOutlines = () => {
    const wanted = new Map<Element, string>();
    for (const element of selection) wanted.set(element, selectionRing);
    if (hovered && !wanted.has(hovered)) wanted.set(hovered, hoverRing);
    // Snapshots show the node alone, as on the GPU backend: no outline on it or inside it.
    overlay.style.visibility = capturing.length ? 'hidden' : '';
    const nextNodes = new Set<HTMLElement>();
    for (const [element, outline] of wanted) {
      if (!nodes.has(element as HTMLElement)) continue;
      if (capturing.includes(element as HTMLElement)) continue;
      (element as HTMLElement).style.outline = outline;
      nextNodes.add(element as HTMLElement);
    }
    for (const node of outlinedNodes) if (!nextNodes.has(node)) node.style.outline = '';
    outlinedNodes = nextNodes;
    for (const [element, box] of boxes) {
      if (wanted.has(element)) continue;
      box.remove();
      boxes.delete(element);
    }
    for (const [element, outline] of wanted) {
      if (nodes.has(element as HTMLElement)) continue;
      let box = boxes.get(element);
      if (!box) {
        box = document.createElement('div');
        Object.assign(box.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          pointerEvents: 'none',
        });
        overlay.append(box);
        boxes.set(element, box);
      }
      box.style.outline = outline;
    }
    if (boxes.size && !boxFrame) placeBoxes();
  };
  /** Animated CSS looks, run by the browser as filter animations. */
  const animations = new Map<HTMLElement, Animation>();
  const KEYFRAMES = 24;
  const clearEffect = (element: HTMLElement) => {
    animations.get(element)?.cancel();
    animations.delete(element);
    element.style.filter = '';
  };
  const applyEffect = (element: HTMLElement, effect: Effect | null, params?: ArrayLike<number>) => {
    clearEffect(element);
    if (!effect?.css) return;
    const values = effectParams(effect, params);
    if (!effect.animated) {
      element.style.filter = effect.css(values, 0);
      return;
    }
    const period = effect.period ?? 4;
    const keyframes = Array.from({ length: KEYFRAMES + 1 }, (_, i) => ({
      filter: effect.css!(values, (i / KEYFRAMES) * period),
    }));
    animations.set(
      element,
      element.animate(keyframes, { duration: period * 1000, iterations: Infinity }),
    );
  };
  apply(base.camera());

  return {
    ...base.api,
    mode: 'dom',
    getElementRect: elementRect,
    setSelection(elements) {
      selection = new Set(elements);
      drawOutlines();
    },
    setHover(element) {
      if (element === hovered) return;
      hovered = element;
      drawOutlines();
    },
    setEffect(element, effect, params) {
      if (nodes.has(element)) applyEffect(element, effect, params);
    },
    // The browser repaints DOM nodes itself.
    invalidate() {},
    async snapshot(element, { scale = devicePixelRatio } = {}) {
      if (!nodes.has(element)) throw new Error('Not a node on this canvas');
      if (!options.snapshotFallback) {
        throw new Error(
          'snapshot needs the GPU backend (WebGPU and HTML-in-Canvas) or snapshotFallback',
        );
      }
      capturing.push(element);
      drawOutlines();
      try {
        return await options.snapshotFallback(element, { scale });
      } finally {
        capturing.splice(capturing.indexOf(element), 1);
        drawOutlines();
      }
    },
    setBackground(color) {
      surface.style.background = color;
    },
    getStats() {
      const view = base.view();
      let visible = 0;
      for (const node of nodes.values()) if (intersects(node.rect, view)) visible++;
      return {
        mode: 'dom',
        nodes: nodes.size,
        visible,
        pending: 0,
        rasterizedLastFrame: 0,
        rasterMs: 0,
        atlasLayersUsed: 0,
        frameMs,
      };
    },
    destroy() {
      cancelAnimationFrame(boxFrame);
      base.destroy();
    },
  };
}
