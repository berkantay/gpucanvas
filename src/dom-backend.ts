import {
  bindCameraInput,
  fitCamera,
  intersects,
  visibleWorldRect,
  type Camera,
  type Rect,
} from './camera';
import { applyNodeBase, applyNodeSize, boundsOf } from './node-style';
import {
  DEFAULT_CAMERA,
  DEFAULT_SELECTION_COLOR,
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
  surface.append(world);
  host.append(surface);

  const nodes = new Map<HTMLElement, Rect>();
  let selected = new Set<HTMLElement>();
  // Outlines live inside the zoomed world, so their width divides the zoom back out.
  const outline = `calc(${SELECTION_WIDTH}px / var(--gpucanvas-zoom)) solid ${
    options.selectionColor ?? DEFAULT_SELECTION_COLOR
  }`;
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
      selected.delete(element);
      element.remove();
    },
    getNodeRect: (element) => nodes.get(element) ?? null,
    getNodesIn(rect) {
      return [...nodes].filter(([, node]) => intersects(node, rect)).map(([element]) => element);
    },
    setSelection(elements) {
      const next = new Set([...elements].filter((element) => nodes.has(element)));
      for (const element of selected) if (!next.has(element)) element.style.outline = '';
      for (const element of next) if (!selected.has(element)) element.style.outline = outline;
      selected = next;
    },
    getCamera: () => camera,
    setCamera,
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
      unbindInput();
      surface.remove();
    },
  };
}
