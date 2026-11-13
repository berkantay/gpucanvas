import {
  bindCameraInput,
  containsPoint,
  fitCamera,
  intersects,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  type Camera,
  type Rect,
} from './camera';
import { elementInNode, nodeOfElement, rectInNode } from './elements';
import { applyNodeBase, applyNodeSize, boundsOf } from './node-style';
import {
  DEFAULT_CAMERA,
  DEFAULT_SELECTION_COLOR,
  HOVER_WIDTH,
  SELECTION_WIDTH,
  type GpuCanvas,
  type GpuCanvasOptions,
} from './types';

/**
 * The fallback, and the way most infinite canvases work today: every node is absolutely
 * positioned inside one world element that the camera moves with a CSS transform.
 */
export function createDomCanvas(host: HTMLElement, options: GpuCanvasOptions): GpuCanvas {
  const surface = document.createElement('div');
  surface.dataset.gpucanvasSurface = '';
  Object.assign(surface.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    touchAction: 'none',
    background: options.background ?? 'transparent',
  });
  const world = document.createElement('div');
  world.dataset.gpucanvasSurface = '';
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
  host.append(surface);

  const nodes = new Map<HTMLElement, Rect>();
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
    return node ? rectInNode(node, nodes.get(node)!, element) : null;
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
  const drawOutlines = () => {
    const wanted = new Map<Element, string>();
    for (const element of selection) wanted.set(element, selectionRing);
    if (hovered && !wanted.has(hovered)) wanted.set(hovered, hoverRing);
    const nextNodes = new Set<HTMLElement>();
    for (const [element, outline] of wanted) {
      if (!nodes.has(element as HTMLElement)) continue;
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
  let camera = options.camera ?? DEFAULT_CAMERA;
  let frameMs = 0;

  const apply = () => {
    const start = performance.now();
    world.style.transform = `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;
    world.style.setProperty('--gpucanvas-zoom', String(camera.zoom));
    frameMs = performance.now() - start;
  };
  const setCamera = (next: Camera) => {
    camera = next;
    apply();
    options.onCameraChange?.(camera);
  };
  const unbindInput = bindCameraInput(surface, () => camera, setCamera);
  apply();

  return {
    mode: 'dom',
    surface,
    addNode(element, rect) {
      applyNodeBase(element);
      element.style.position = 'absolute';
      nodes.set(element, rect);
      this.updateNode(element, rect);
      world.append(element);
    },
    updateNode(element, rect) {
      nodes.set(element, rect);
      element.style.left = `${rect.x}px`;
      element.style.top = `${rect.y}px`;
      applyNodeSize(element, rect);
    },
    removeNode(element) {
      nodes.delete(element);
      outlinedNodes.delete(element);
      element.style.outline = '';
      element.remove();
    },
    getNodeRect: (element) => nodes.get(element) ?? null,
    getNodesIn(rect) {
      return [...nodes].filter(([, node]) => intersects(node, rect)).map(([element]) => element);
    },
    getNodeOf: (element) => nodeOfElement(nodes, element),
    getElementRect: elementRect,
    getElementAt(point) {
      // The last node added draws on top.
      let top: HTMLElement | null = null;
      for (const [element, rect] of nodes) if (containsPoint(rect, point)) top = element;
      return top ? elementInNode(top, nodes.get(top)!, point) : null;
    },
    setSelection(elements) {
      selection = new Set(elements);
      drawOutlines();
    },
    setHover(element) {
      if (element === hovered) return;
      hovered = element;
      drawOutlines();
    },
    getCamera: () => camera,
    setCamera,
    screenToWorld: (point) => screenToWorld(camera, point),
    worldToScreen: (point) => worldToScreen(camera, point),
    // The browser repaints DOM nodes itself.
    invalidate() {},
    setBackground(color) {
      surface.style.background = color;
    },
    fit(padding) {
      const bounds = boundsOf(nodes.values());
      if (bounds) setCamera(fitCamera(bounds, surface.clientWidth, surface.clientHeight, padding));
    },
    getStats() {
      const view = visibleWorldRect(camera, surface.clientWidth, surface.clientHeight);
      let visible = 0;
      for (const rect of nodes.values()) if (intersects(rect, view)) visible++;
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
      unbindInput();
      surface.remove();
    },
  };
}
