import { Atlas, type AtlasSlot } from './atlas';
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
import { CompositeRenderer, FLOATS_PER_INSTANCE } from './gpu-renderer';
import { boundsOf } from './node-style';
import { Page } from './page';
import {
  DEFAULT_CAMERA,
  DEFAULT_SELECTION_COLOR,
  HOVER_WIDTH,
  SELECTION_WIDTH,
  type GpuCanvas,
  type GpuCanvasOptions,
} from './types';

interface Node {
  element: HTMLElement;
  rect: Rect;
  page: Page;
  /** The node's position on its page, CSS pixels. */
  pageX: number;
  pageY: number;
  slot: AtlasSlot | null;
  /** Texels per CSS pixel the slot was rasterized at. */
  slotScale: number;
  /**
   * A THUMBNAIL_SCALE snapshot in the atlas's pinned layer. It is never evicted, so zoomed out
   * the node needs nothing else, and closer in it stands in while a sharper snapshot is drawn.
   */
  thumb: AtlasSlot | null;
  /** The node changed since its thumbnail was drawn. */
  thumbStale: boolean;
  /** When the thumbnail was last drawn, from performance.now(). */
  thumbAt: number;
  /** What the last composite showed for this node: 0 nothing, 1 placeholder, 2 snapshot, 3 sharp. */
  shown: number;
  shownFrame: number;
  /** Content changed since the slot was rasterized. */
  dirty: boolean;
  /**
   * Zoomed in past MAX_RASTER_SCALE the whole snapshot is only a backdrop: the part in view is
   * drawn sharp as tiles, filled center first within the frame budget. While content animates,
   * one half-resolution preview of the view stands in, since redrawing every tile each frame
   * would cost too much.
   */
  tiles: Tile[];
  preview: AtlasSlot | null;
  previewRect: Rect | null;
  previewScale: number;
  /** Scratch: this frame's preview rect and scale, when one is needed. */
  previewTarget: Rect | null;
  previewTargetScale: number;
  /** Last time the node's content changed, from performance.now(). */
  changedAt: number;
  /** Last time a change of the node's content reached the atlas. */
  refreshedAt: number;
  /**
   * The whole snapshot predates a change that only the preview and tiles show so far. It is
   * redrawn once the node is no longer zoomed in that far.
   */
  wholeStale: boolean;
  /** Alone on its page, so zoomed-in snapshots rasterize only this node. */
  solo: boolean;
  /** Scratch values for the current frame's plan. */
  targetScale: number;
  priority: number;
}

/** A sharp piece of a zoomed-in node, `rect` in world units. */
interface Tile {
  slot: AtlasSlot;
  rect: Rect;
  scale: number;
  column: number;
  row: number;
  /** Shows content from before the node's last change; stays until a fresh tile replaces it. */
  stale: boolean;
}

interface TileJob {
  node: Node;
  rect: Rect;
  scale: number;
  column: number;
  row: number;
  priority: number;
}

interface PagePlan {
  page: Page;
  /** Nodes that need a whole snapshot. */
  nodes: Node[];
  /** Nodes that need a preview, then tiles; both after any whole snapshot. */
  previews: Node[];
  tiles: TileJob[];
  priority: number;
}

const MIN_RASTER_SCALE = 1 / 64;
/**
 * Whole-node snapshots stop here (100% zoom on a 2x display); closer in, tiles of the visible
 * part take over. A snapshot costs about 12 ns per pixel on the main thread, so one large card
 * at 4x would already stall a frame.
 */
const MAX_RASTER_SCALE = 2;
const MAX_DETAIL_SCALE = 64;
/** Side of a tile in device pixels: about 3 ms to draw, so two fit the frame budget. */
const TILE_PIXELS = 512;
/**
 * Content that changed this recently counts as animating: zoomed in, it is drawn as one
 * half-resolution preview of the view, then as sharp tiles once it rests. The full screen at 8x
 * zoom is about ten million pixels, too many to redraw every frame.
 */
const CONTENT_SETTLE_MS = 150;

/**
 * Live content (spinners, clocks, video) changes every frame. A node that small on screen shows
 * no difference between 60 redraws a second and a few, so below SMALL_NODE_PX it refreshes at
 * most every SMALL_REFRESH_MS. Thousands of tiny spinners then cost what a few large ones do.
 */
const SMALL_NODE_PX = 200;
const SMALL_REFRESH_MS = 250;
const right = (rect: Rect) => rect.x + rect.width;
const bottom = (rect: Rect) => rect.y + rect.height;
/** How long the camera must rest before blurry snapshots are upgraded. */
const SETTLE_MS = 120;
/** Events that use a node, and how long after one its transitions are followed frame by frame. */
const USE_EVENTS = ['click', 'input', 'change', 'keydown'] as const;
const USED_MS = 1000;
/** A node that stops being live stays rasterizable this long, so hover-out transitions finish. */
const LINGER_MS = 300;
/** Kept snapshots may be this many times sharper than needed before they are redrawn smaller. */
const MAX_OVERSAMPLING = 4;
const DEFAULT_PAGE_SIZE = 2048;
/**
 * Thumbnails: a 1440 px wide screen is 90 texels across, as sharp as it gets on a 2x display at
 * the 3% zoom of a 5,000 node overview. Five thousand of them fit the pinned layer.
 */
const THUMBNAIL_SCALE = 1 / 16;
/** Live content redraws its thumbnail at most this often; nobody reads a spinner at 3% zoom. */
const THUMBNAIL_REFRESH_MS = 1000;
/**
 * Pages made drawable per frame. Chrome paints every drawable page in its rendering update,
 * outside our own timing, and a page of two dozen rich cards can take tens of milliseconds, so
 * the count adapts to how long frames actually take: halved after a slow frame, grown by one
 * after a fast one.
 */
const MAX_PROMOTIONS_PER_FRAME = 8;
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 12;

/** Need classes, most urgent first. */
const MISSING = 0;
const DIRTY = 1;
const BLURRY = 2;
const OVERSAMPLED = 3;

export function supportsGpuCanvas(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'requestPaint' in HTMLCanvasElement.prototype &&
    'getElementTransform' in HTMLCanvasElement.prototype &&
    typeof GPUQueue !== 'undefined' &&
    'drawElementImageToTexture' in GPUQueue.prototype
  );
}

/**
 * Snapshots are rasterized at power-of-two scales so zooming reuses them; a snapshot up to 10%
 * too small is accepted before paying for the next scale.
 */
function rasterScaleFor(deviceScale: number) {
  const scale = 2 ** Math.ceil(Math.log2(deviceScale) - 0.14);
  return Math.min(MAX_DETAIL_SCALE, Math.max(MIN_RASTER_SCALE, scale));
}

const intersection = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
};

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

function cssColorToRgba(color: string): [number, number, number, number] {
  const context = document.createElement('canvas').getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

const premultiplied = ([r, g, b, a]: [number, number, number, number]) =>
  [r * a, g * a, b * a, a] as [number, number, number, number];

const distanceToCenter = (rect: Rect, view: Rect) =>
  Math.hypot(
    rect.x + rect.width / 2 - (view.x + view.width / 2),
    rect.y + rect.height / 2 - (view.y + view.height / 2),
  );

/**
 * The GPU backend.
 *
 * Nodes are live DOM, grouped into pages inside `<canvas content="drawable">`. A page that has
 * nodes waiting for pixels is made drawable, rasterized into a texture-array atlas in the next
 * paint event (whole, or one node at a time when only a few changed), then parked with
 * `content-visibility: hidden` so it costs the browser nothing per frame. Compositing runs from
 * requestAnimationFrame and draws every visible node in one instanced call, so panning and
 * zooming never touch the DOM.
 *
 * Hit testing (Chrome 157): only drawables registered with `updateElementGeometry` are hit
 * tested, at their CSS position. Only the page under the pointer is registered, and its CSS
 * transform puts the node under the pointer exactly where the GPU drew it.
 */
export async function createGpuCanvas(
  host: HTMLElement,
  options: GpuCanvasOptions,
): Promise<GpuCanvas> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('gpucanvas: no WebGPU adapter');
  const device = await adapter.requestDevice();

  const surface = document.createElement('div');
  surface.dataset.gpucanvasSurface = '';
  Object.assign(surface.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    touchAction: 'none',
  });
  const canvas = document.createElement('canvas');
  canvas.setAttribute('content', 'drawable');
  canvas.dataset.gpucanvasSurface = '';
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  surface.append(canvas);
  host.append(surface);

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const atlasSize = Math.min(options.atlasSize ?? 4096, device.limits.maxTextureDimension2D);
  const atlas = new Atlas(
    device,
    atlasSize,
    Math.min(options.atlasLayers ?? 5, device.limits.maxTextureArrayLayers),
  );
  const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, atlasSize);
  const maxRasterCalls = options.maxRastersPerFrame ?? 12;
  const rasterTimeBudgetMs = options.rasterTimeBudgetMs ?? 6;
  const rasterPixelBudget = options.rasterPixelBudget ?? 24_000_000;
  // Nodes still waiting for pixels draw as a block slightly off the background.
  const colorsFor = (css: string) => {
    const background = cssColorToRgba(css);
    const shade = background[0] + background[1] + background[2] > 1.5 ? 0.92 : 1.25;
    const placeholder = background.map((channel) =>
      Math.min(1, channel * shade + (shade > 1 ? 0.02 : 0)),
    );
    placeholder[3] = 1;
    return [background, placeholder] as [typeof background, typeof background];
  };
  const renderer = new CompositeRenderer(
    device,
    context,
    format,
    atlas,
    ...colorsFor(options.background ?? '#f4f4f5'),
  );
  const selectionColor = premultiplied(
    cssColorToRgba(options.selectionColor ?? DEFAULT_SELECTION_COLOR),
  );
  const hoverColor = options.hoverColor
    ? premultiplied(cssColorToRgba(options.hoverColor))
    : selectionColor;

  const nodes = new Map<HTMLElement, Node>();
  /** Outlined elements: nodes or anything inside them. */
  let selection = new Set<Element>();
  let hovered: Element | null = null;
  /** World rects of outlined elements inside nodes, measured once until their layout changes. */
  const ringRects = new Map<Element, Rect>();
  const ringRect = (element: Element): Rect | null => {
    const own = nodes.get(element as HTMLElement);
    if (own) return own.rect;
    const at = element.isConnected ? nodeOfElement(nodes, element) : null;
    if (!at) return null;
    const node = nodes.get(at)!;
    let rect = ringRects.get(element);
    if (!rect) ringRects.set(element, (rect = rectInNode(at, node.rect, element)));
    return rect;
  };
  const pages = new Map<Page, Set<Node>>();
  // What is on screen survives a full atlas: whole snapshots first, then sharp tiles.
  atlas.keep = function* () {
    const onScreen = (tile: Tile) => intersects(tile.rect, frameView);
    for (const node of visible) yield node.slot;
    for (const node of visible) {
      for (const tile of node.tiles) {
        if (tile.scale === detailScale && !tile.stale && onScreen(tile)) yield tile.slot;
      }
    }
    for (const node of visible) {
      yield node.preview;
      for (const tile of node.tiles) if (onScreen(tile)) yield tile.slot;
    }
  };
  const pageByElement = new Map<Element, Page>();
  let openPage: Page | null = null;

  let camera = options.camera ?? DEFAULT_CAMERA;
  let lastCameraChange = -Infinity;
  let frameNumber = 0;
  let promotionsPerFrame = 2;
  let lastFrameAt = 0;
  let rafId = 0;
  let destroyed = false;
  /** The node under the pointer: the only one that receives pointer events. */
  let live: Node | null = null;
  let livePositioned = false;
  let lingering: Node | null = null;
  let lingerTimer = 0;
  let focused: Node | null = null;
  let pointer: { x: number; y: number } | null = null;
  let settleTimer = 0;
  const stats = {
    visible: 0,
    pending: 0,
    rasterizedLastFrame: 0,
    rasterCallsLastFrame: 0,
    rasterMs: 0,
    frameMs: 0,
    frames: 0,
    lostPixels: 0,
    lostDetail: 0,
    onThumbnail: 0,
    /** Last plan's nodes per need class: missing, dirty, blurry, oversampled. */
    needs: [0, 0, 0, 0],
  };
  const visible: Node[] = [];
  const plans = new Map<Page, PagePlan>();

  const schedule = () => {
    if (rafId || destroyed) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      frameNumber++;
      frame(false);
    });
  };

  const resizeObserver = new ResizeObserver(([entry]) => {
    const size = entry.devicePixelContentBoxSize?.[0];
    canvas.width = Math.max(
      1,
      size ? size.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio),
    );
    canvas.height = Math.max(
      1,
      size ? size.blockSize : Math.round(entry.contentRect.height * devicePixelRatio),
    );
    schedule();
  });
  resizeObserver.observe(canvas, { box: 'device-pixel-content-box' });

  /** Readable nodes in view with CSS transitions running, and when the last one ends. */
  const transitioning = new Map<Node, number>();
  const isPinned = (page: Page) =>
    live?.page === page ||
    lingering?.page === page ||
    focused?.page === page ||
    [...transitioning.keys()].some((node) => node.page === page);

  /** This frame's texels per CSS pixel for tiles, and the world rect in view. */
  let detailScale = 1;
  let frameView: Rect = { x: 0, y: 0, width: 0, height: 0 };
  let contentTimer = 0;
  const scheduleAfterContentSettles = () => {
    clearTimeout(contentTimer);
    contentTimer = window.setTimeout(schedule, CONTENT_SETTLE_MS + 10);
  };
  let refreshTimer = 0;
  let refreshAt = Infinity;
  /** How long a changed node waits before it is redrawn: only small ones wait. */
  const refreshWait = (node: Node, now: number) =>
    Math.max(node.rect.width, node.rect.height) * camera.zoom < SMALL_NODE_PX
      ? node.refreshedAt + SMALL_REFRESH_MS - now
      : 0;
  const refreshLater = (wait: number) => {
    const at = performance.now() + wait;
    if (at >= refreshAt) return;
    clearTimeout(refreshTimer);
    refreshAt = at;
    refreshTimer = window.setTimeout(() => {
      refreshAt = Infinity;
      schedule();
    }, wait);
  };
  /** Builds this frame's raster plan: which visible nodes need pixels, grouped by page. */
  const planFrame = (view: Rect, desiredScale: number, deviceScale: number, moving: boolean) => {
    const now = performance.now();
    // Tiles are redrawn whenever the zoom settles anyway, so they use the exact device scale:
    // one tile texel per screen pixel.
    detailScale = Math.min(deviceScale, MAX_DETAIL_SCALE);
    frameView = view;
    visible.length = 0;
    plans.clear();
    stats.needs = [0, 0, 0, 0];
    for (const node of nodes.values()) {
      if (!intersects(node.rect, view)) continue;
      visible.push(node);
      const scale = Math.min(
        desiredScale,
        MAX_RASTER_SCALE,
        (atlasSize - 1) / node.rect.width,
        (atlasSize - 1) / node.rect.height,
      );
      if (node.dirty) node.changedAt = now;
      // Zoomed out this far the thumbnail is all the detail there is to see.
      const thumbnailEnough = scale <= THUMBNAIL_SCALE;
      if (thumbnailEnough && freshThumb(node) && !node.dirty && !node.wholeStale) {
        node.slot = node.thumb;
        node.slotScale = THUMBNAIL_SCALE;
      }
      const animating = now - node.changedAt < CONTENT_SETTLE_MS;
      const deep = desiredScale > scale;
      if (deep && !node.solo) lift(node);
      const jobs = deep ? planDetail(node, view, animating, moving) : [];
      if (!deep) {
        node.preview = null;
        node.tiles.length = 0;
      }
      const valid = atlas.isValid(node.slot);
      let need = -1;
      // A node with a thumbnail has something on screen, so empty ones go first.
      if (!valid) need = atlas.isValid(node.thumb) ? DIRTY : MISSING;
      // Zoomed in, the whole snapshot is a backdrop under the preview and tiles; a change can
      // wait for it until the node is seen at a smaller zoom.
      else if (deep) need = node.slotScale < scale / (moving ? 4 : 2) ? BLURRY : -1;
      else if (node.dirty || node.wholeStale) {
        const wait = refreshWait(node, now);
        if (wait > 0) refreshLater(wait);
        else need = DIRTY;
      }
      // In motion only snapshots under half the needed scale are redrawn, nearest the middle
      // first within the frame's budget, so a flight never shows thumbnails blown up.
      else if (node.slotScale < (moving ? scale / 2 : scale)) need = BLURRY;
      else if (!moving && node.slotScale > scale * MAX_OVERSAMPLING) need = OVERSAMPLED;
      if (need >= 0) stats.needs[need]++;
      if (need < 0 && !node.previewTarget && jobs.length === 0) continue;
      // Snapshots this small are thumbnails, and those have one fixed scale.
      node.targetScale = thumbnailEnough ? THUMBNAIL_SCALE : scale;
      node.priority = (need < 0 ? BLURRY : need) * 1e12 + distanceToCenter(node.rect, view);
      let plan = plans.get(node.page);
      if (!plan) {
        plan = { page: node.page, nodes: [], previews: [], tiles: [], priority: node.priority };
        plans.set(node.page, plan);
      }
      plan.priority = Math.min(plan.priority, node.priority);
      if (need >= 0) plan.nodes.push(node);
      if (node.previewTarget) plan.previews.push(node);
      plan.tiles.push(...jobs);
    }
    for (const plan of plans.values()) plan.tiles.sort((a, b) => a.priority - b.priority);
  };

  /**
   * Plans a zoomed-in node: a preview while its content animates, otherwise the tiles in view
   * it is missing at this frame's scale.
   */
  const planDetail = (node: Node, view: Rect, animating: boolean, moving: boolean) => {
    const shown = intersection(node.rect, view)!;
    node.previewTarget = null;
    node.tiles = node.tiles.filter((tile) => atlas.isValid(tile.slot));
    // Old tiles stay on screen under the preview until fresh ones replace them.
    if (node.dirty) for (const tile of node.tiles) tile.stale = true;
    if (!atlas.isValid(node.preview)) node.preview = null;
    if (animating) {
      const scale = detailScale / 2;
      const stale =
        !node.preview ||
        node.dirty ||
        node.previewScale !== scale ||
        !contains(node.previewRect!, shown);
      if (stale) {
        node.previewTarget = fitPreview(shown, scale);
        node.previewTargetScale = scale;
      }
      scheduleAfterContentSettles();
      return [];
    }
    // Panning at a steady zoom keeps filling tiles; while the zoom changes it waits to settle.
    const current = node.tiles.filter((tile) => tile.scale === detailScale && !tile.stale);
    if (moving && current.length === 0) return [];
    const size = Math.max(1, Math.floor(TILE_PIXELS / detailScale));
    const jobs: TileJob[] = [];
    const first = (edge: number, origin: number) => Math.floor((edge - origin) / size);
    for (
      let row = first(shown.y, node.rect.y);
      row <= first(bottom(shown) - 1e-6, node.rect.y);
      row++
    ) {
      for (
        let column = first(shown.x, node.rect.x);
        column <= first(right(shown) - 1e-6, node.rect.x);
        column++
      ) {
        if (current.some((tile) => tile.column === column && tile.row === row)) continue;
        const rect = intersection(node.rect, {
          x: node.rect.x + column * size,
          y: node.rect.y + row * size,
          width: size,
          height: size,
        })!;
        jobs.push({
          node,
          rect,
          scale: detailScale,
          column,
          row,
          priority: distanceToCenter(rect, view),
        });
      }
    }
    // Once the view is tiled at this scale, older tiles and the preview are hidden anyway.
    if (jobs.length === 0) {
      node.tiles = current;
      node.preview = null;
    }
    return jobs;
  };

  /** The world rect a preview covers: `shown`, shrunk around its center to fit one layer. */
  const fitPreview = (shown: Rect, scale: number): Rect => {
    const limit = (atlasSize - 2) / scale;
    const fit = (start: number, size: number) =>
      size <= limit ? [start, size] : [start + (size - limit) / 2, limit];
    const [x, width] = fit(shown.x, shown.width);
    const [y, height] = fit(shown.y, shown.height);
    return { x, y, width, height };
  };

  /** Draws one snapshot region into the atlas. Returns false when it could not. */
  const drawSnapshot = (
    page: Page,
    source: { x: number; y: number; width: number; height: number } | null,
    slot: AtlasSlot,
  ) => {
    try {
      device.queue.drawElementImageToTexture(
        source
          ? {
              source: page.element,
              sourceX: source.x,
              sourceY: source.y,
              sourceWidth: source.width,
              sourceHeight: source.height,
            }
          : { source: page.element },
        {
          texture: atlas.texture,
          origin: { x: slot.x, y: slot.y, z: slot.layer },
          size: { width: slot.width, height: slot.height },
          premultipliedAlpha: true,
        },
      );
      return true;
    } catch {
      // Not recorded yet; the next paint event retries.
      return false;
    }
  };

  /**
   * Atlas space for a `width` x `height` snapshot. A redraw at the same size overwrites the slot
   * it replaces, so redraws (a hover, a click, an animation) never fill the atlas. Thumbnails go
   * to the pinned layer while it has room.
   */
  const slotFor = (previous: AtlasSlot | null, width: number, height: number, thumbnail = false) =>
    atlas.isValid(previous) &&
    atlas.isPinned(previous) === thumbnail &&
    previous.width === width &&
    previous.height === height &&
    Number.isInteger(previous.x) &&
    Number.isInteger(previous.y)
      ? previous
      : ((thumbnail ? atlas.allocatePinned(width, height) : null) ?? atlas.allocate(width, height));
  const freshThumb = (node: Node) => atlas.isValid(node.thumb) && !node.thumbStale;
  /** Records a snapshot that reached the atlas; at thumbnail scale it is the node's thumbnail. */
  const drawn = (node: Node, slot: AtlasSlot, scale: number, now: number) => {
    node.slot = slot;
    node.slotScale = scale;
    if (scale === THUMBNAIL_SCALE) {
      node.thumb = slot;
      node.thumbStale = false;
      node.thumbAt = now;
    } else if (node.dirty) node.thumbStale = true;
    if (node.dirty) {
      // A preview from before the change would cover the fresh snapshot.
      node.preview = null;
      node.refreshedAt = now;
    }
    node.dirty = false;
    node.wholeStale = false;
  };
  /** Whole page slots per page, reused when the page is drawn again at the same size. */
  const pageSlots = new Map<Page, AtlasSlot>();

  /**
   * Rasterizes planned pages in priority order within the frame's budget. A page where many
   * nodes need pixels is drawn whole in one call; otherwise each node is cropped out.
   */
  const rasterize = (start: number) => {
    let calls = 0;
    let pixels = 0;
    let rasterized = 0;
    let pending = 0;
    const overBudget = () =>
      calls > 0 &&
      (calls >= maxRasterCalls ||
        pixels >= rasterPixelBudget ||
        performance.now() - start >= rasterTimeBudgetMs);
    const ordered = [...plans.values()].sort((a, b) => a.priority - b.priority);
    for (const plan of ordered) {
      const { page } = plan;
      // A page promoted this frame may still hold the snapshot from before it was parked.
      if (!page.drawable || page.promotedFrame >= frameNumber || overBudget()) {
        pending += plan.nodes.length + plan.previews.length + plan.tiles.length;
        continue;
      }
      const scale = plan.nodes.reduce((max, node) => Math.max(max, node.targetScale), 0);
      const members = pages.get(page)!;
      const neededArea = plan.nodes.reduce((sum, n) => sum + n.rect.width * n.rect.height, 0);
      // A whole page also redraws members nobody is looking at, so it is worth it only while
      // the page is small in the atlas: at most a quarter of a layer.
      const wholeFits = page.width * scale <= atlasSize / 2 && page.height * scale <= atlasSize / 2;
      const whole =
        wholeFits && (plan.nodes.length >= 6 || neededArea >= 0.25 * page.width * page.height);
      const wholeSlot = whole
        ? slotFor(
            pageSlots.get(page) ?? null,
            Math.ceil(page.width * scale),
            Math.ceil(page.height * scale),
            scale === THUMBNAIL_SCALE,
          )
        : null;
      if (wholeSlot) pageSlots.set(page, wholeSlot);
      if (wholeSlot && !drawSnapshot(page, null, wholeSlot)) {
        pending += plan.nodes.length + plan.previews.length + plan.tiles.length;
        continue;
      }

      if (wholeSlot) {
        const slot = wholeSlot;
        calls++;
        pixels += slot.width * slot.height;
        for (const node of members) {
          const part = {
            layer: slot.layer,
            generation: slot.generation,
            x: slot.x + node.pageX * scale,
            y: slot.y + node.pageY * scale,
            width: node.rect.width * scale,
            height: node.rect.height * scale,
          };
          drawn(node, part, scale, start);
        }
        rasterized += members.size;
      } else {
        for (const node of plan.nodes) {
          if (overBudget()) {
            pending++;
            continue;
          }
          const thumbnail = node.targetScale === THUMBNAIL_SCALE;
          const slot = slotFor(
            thumbnail ? node.thumb : node.slot,
            Math.max(1, Math.round(node.rect.width * node.targetScale)),
            Math.max(1, Math.round(node.rect.height * node.targetScale)),
            thumbnail,
          );
          const region = {
            x: node.pageX,
            y: node.pageY,
            width: node.rect.width,
            height: node.rect.height,
          };
          if (!slot || !drawSnapshot(page, region, slot)) {
            pending++;
            continue;
          }
          calls++;
          pixels += slot.width * slot.height;
          drawn(node, slot, node.targetScale, start);
          rasterized++;
        }
      }
      /** Crops `rect` (world units) of `node` out of its page into the atlas at `scale`. */
      // The first snapshot at a scale in a frame pays to rasterize the page at that scale;
      // further crops at the same scale are nearly free, so they skip the budget.
      const warm = new Set<number>();
      const drawRegion = (node: Node, rect: Rect, scale: number, previous: AtlasSlot | null) => {
        if (!warm.has(scale) && overBudget()) return null;
        const slot = slotFor(
          previous,
          Math.max(1, Math.round(rect.width * scale)),
          Math.max(1, Math.round(rect.height * scale)),
        );
        const region = {
          x: node.pageX + rect.x - node.rect.x,
          y: node.pageY + rect.y - node.rect.y,
          width: rect.width,
          height: rect.height,
        };
        if (!slot || !drawSnapshot(page, region, slot)) return null;
        calls++;
        warm.add(scale);
        pixels += slot.width * slot.height;
        // The node's whole snapshot now lags behind what the preview and tiles show.
        if (node.dirty) {
          node.dirty = false;
          node.wholeStale = true;
          node.thumbStale = true;
          node.refreshedAt = start;
        }
        return slot;
      };
      for (const node of plan.previews) {
        const slot = drawRegion(node, node.previewTarget!, node.previewTargetScale, node.preview);
        if (!slot) {
          pending++;
          continue;
        }
        node.preview = slot;
        node.previewRect = node.previewTarget;
        node.previewScale = node.previewTargetScale;
        node.previewTarget = null;
      }
      let tilesLeft = 0;
      for (const job of plan.tiles) {
        // A change since planning makes the job's content stale; the next plan redoes it.
        const { node, column, row, scale } = job;
        const old = node.tiles.findIndex(
          (tile) =>
            tile.stale && tile.scale === scale && tile.column === column && tile.row === row,
        );
        const previous = old >= 0 ? node.tiles[old].slot : null;
        const slot = node.dirty ? null : drawRegion(node, job.rect, scale, previous);
        if (!slot) {
          tilesLeft++;
          continue;
        }
        if (old >= 0) node.tiles.splice(old, 1);
        node.tiles.push({ slot, rect: job.rect, scale, column, row, stale: false });
      }
      pending += tilesLeft;
      // While the page is drawable, its nodes' thumbnails are nearly free: one small raster of
      // the page, then a crop per node.
      for (const node of members) {
        if (freshThumb(node) || node.dirty) continue;
        if (atlas.isValid(node.thumb) && start - node.thumbAt < THUMBNAIL_REFRESH_MS) continue;
        const slot = slotFor(
          node.thumb,
          Math.max(1, Math.round(node.rect.width * THUMBNAIL_SCALE)),
          Math.max(1, Math.round(node.rect.height * THUMBNAIL_SCALE)),
          true,
        );
        const region = {
          x: node.pageX,
          y: node.pageY,
          width: node.rect.width,
          height: node.rect.height,
        };
        if (!slot || !drawSnapshot(page, region, slot)) continue;
        calls++;
        node.thumb = slot;
        node.thumbStale = false;
        node.thumbAt = start;
      }
      const done =
        plan.nodes.every((node) => !node.dirty && atlas.isValid(node.slot)) &&
        plan.previews.every((node) => node.previewTarget === null) &&
        tilesLeft === 0;
      if (done && !isPinned(page)) page.setDrawable(false, frameNumber);
    }
    stats.rasterizedLastFrame = rasterized;
    stats.rasterCallsLastFrame = calls;
    return pending;
  };

  const composite = () => {
    let instances = visible.length;
    for (const node of visible) instances += node.tiles.length + (node.preview ? 1 : 0);
    instances += selection.size + 1;
    renderer.reserve(instances);
    const data = renderer.instances;
    let count = 0;
    const push = (rect: Rect, slot: AtlasSlot | null) => {
      const offset = count++ * FLOATS_PER_INSTANCE;
      data[offset] = rect.x;
      data[offset + 1] = rect.y;
      data[offset + 2] = rect.width;
      data[offset + 3] = rect.height;
      if (slot) {
        atlas.touch(slot.layer);
        data[offset + 4] = slot.x;
        data[offset + 5] = slot.y;
        data[offset + 6] = slot.x + slot.width;
        data[offset + 7] = slot.y + slot.height;
        data[offset + 8] = slot.layer;
        data[offset + 9] = 0;
      } else {
        data[offset + 9] = 1;
      }
    };
    const pushRing = (element: Element, color: number[], width: number) => {
      const rect = ringRect(element);
      if (!rect || !intersects(rect, frameView)) return;
      const offset = count++ * FLOATS_PER_INSTANCE;
      data[offset] = rect.x;
      data[offset + 1] = rect.y;
      data[offset + 2] = rect.width;
      data[offset + 3] = rect.height;
      data.set(color, offset + 4);
      data[offset + 9] = 2;
      data[offset + 10] = width;
    };
    let onThumbnail = 0;
    for (const node of visible) {
      // Until its snapshot is drawn, a node shows its thumbnail.
      const base = atlas.isValid(node.slot)
        ? node.slot
        : atlas.isValid(node.thumb)
          ? node.thumb
          : null;
      if (base && base !== node.slot) onThumbnail++;
      const hasSlot = base !== null;
      const sharp = node.tiles.length > 0 || (node.preview !== null && atlas.isValid(node.preview));
      const shown = sharp ? 3 : hasSlot ? 2 : 1;
      // Flicker accounting: pixels a node showed last frame and lost this one. A node coming
      // into view is pop-in, not flicker.
      const before = node.shownFrame === stats.frames - 1 ? node.shown : 0;
      if (before >= 2 && shown === 1) stats.lostPixels++;
      if (before === 3 && shown === 2) stats.lostDetail++;
      node.shown = shown;
      node.shownFrame = stats.frames;
      push(node.rect, base);
      // Back to front: stale tiles and tiles from an earlier zoom, the preview of a change,
      // then this zoom's fresh tiles.
      const current = (tile: Tile) => tile.scale === detailScale && !tile.stale;
      for (const tile of node.tiles)
        if (!current(tile) && atlas.isValid(tile.slot)) push(tile.rect, tile.slot);
      if (node.preview && atlas.isValid(node.preview)) push(node.previewRect!, node.preview);
      for (const tile of node.tiles)
        if (current(tile) && atlas.isValid(tile.slot)) push(tile.rect, tile.slot);
    }
    stats.onThumbnail = onThumbnail;
    // Outlines last, so no neighbor covers them, and hover over the selection.
    for (const element of selection) pushRing(element, selectionColor, SELECTION_WIDTH);
    if (hovered && !selection.has(hovered)) pushRing(hovered, hoverColor, HOVER_WIDTH);
    const cssWidth = canvas.clientWidth;
    const dpr = canvas.width / Math.max(1, cssWidth);
    renderer.draw(camera, cssWidth, canvas.clientHeight, dpr, count);
  };

  /**
   * One frame. From requestAnimationFrame (`inPaint` false) it plans, promotes the pages that
   * need pixels, and either composites straight away or asks for a paint event. In the paint
   * event snapshots are current, so rasterizing happens there, followed by the composite.
   */
  const frame = (inPaint: boolean) => {
    if (destroyed) return;
    const start = performance.now();
    atlas.nextFrame();
    const cssWidth = canvas.clientWidth;
    const dpr = canvas.width / Math.max(1, cssWidth);
    const view = visibleWorldRect(camera, cssWidth, canvas.clientHeight);
    const moving = start - lastCameraChange < SETTLE_MS;
    planFrame(view, rasterScaleFor(camera.zoom * dpr), camera.zoom * dpr, moving);

    if (!inPaint && plans.size > 0) {
      // Only consecutive frames say how long a frame takes.
      const interval = start - lastFrameAt;
      if (interval < 100) {
        if (interval > SLOW_FRAME_MS) promotionsPerFrame = Math.max(1, promotionsPerFrame >> 1);
        else if (interval < FAST_FRAME_MS)
          promotionsPerFrame = Math.min(MAX_PROMOTIONS_PER_FRAME, promotionsPerFrame + 1);
      }
      lastFrameAt = start;
      let promoted = 0;
      for (const plan of [...plans.values()].sort((a, b) => a.priority - b.priority)) {
        if (plan.page.drawable) continue;
        if (promoted++ >= promotionsPerFrame) break;
        plan.page.setDrawable(true, frameNumber);
      }
      // The paint event follows in this same rendering update and finishes the frame.
      awaitingPaint = true;
      canvas.requestPaint();
      return;
    }

    let pending = 0;
    stats.rasterizedLastFrame = 0;
    stats.rasterCallsLastFrame = 0;
    if (inPaint && plans.size > 0) pending = rasterize(start);
    // A page promoted for a camera that has moved on has nothing left to draw: park it, or
    // Chrome keeps painting it every frame.
    for (const page of pages.keys()) {
      if (page.drawable && !plans.has(page) && page.promotedFrame < frameNumber && !isPinned(page))
        page.setDrawable(false, frameNumber);
    }
    stats.rasterMs = performance.now() - start;
    composite();
    stats.frames++;
    positionLivePage();
    stats.visible = visible.length;
    stats.pending = pending;
    stats.frameMs = performance.now() - start;
    if (pending > 0) schedule();
  };

  /** A frame asked for this paint event; others come from content animating on its own. */
  let awaitingPaint = false;
  canvas.onpaint = (event) => {
    // CSS-only changes (hover, focus rings, transitions) on pinned pages reach us only here.
    let changed = false;
    for (const element of event.changedElements) {
      const page = pageByElement.get(element);
      if (!page) continue;
      for (const node of [live, lingering, focused, ...transitioning.keys()]) {
        if (node?.page === page) {
          node.dirty = true;
          changed = true;
        }
      }
    }
    if (changed) ringRects.clear();
    if (!awaitingPaint && !changed) return;
    awaitingPaint = false;
    frame(true);
  };

  const viewNow = () => visibleWorldRect(camera, canvas.clientWidth, canvas.clientHeight);

  /** The node an element belongs to: its ancestor whose parent is a page. */
  const nodeOf = (target: globalThis.Node): Node | undefined => {
    let element = target instanceof HTMLElement ? target : target.parentElement;
    while (element?.parentElement && !pageByElement.has(element.parentElement)) {
      element = element.parentElement;
    }
    return element ? nodes.get(element) : undefined;
  };

  // Content changes on any node, drawable or parked. Style that gpucanvas writes on page and
  // node elements is ignored.
  const mutations = new MutationObserver((records) => {
    // Outlined elements may have moved inside their nodes.
    ringRects.clear();
    let changed = false;
    for (const record of records) {
      const target = record.target as HTMLElement;
      if (
        record.type === 'attributes' &&
        (nodes.has(target) || pageByElement.has(target) || target === canvas)
      ) {
        continue;
      }
      const node = nodeOf(record.target);
      if (node && !node.dirty) {
        node.dirty = true;
        // Off screen it waits until it scrolls into view.
        if (!changed) changed = intersects(node.rect, viewNow());
      }
    }
    if (changed) schedule();
  });
  mutations.observe(canvas, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });

  /** Releases a page from hit testing once nothing pins it; it parks after its next raster. */
  const unpin = (page: Page) => {
    if (isPinned(page)) return;
    if (page.registered) canvas.clearElementGeometry(page.element);
    page.registered = false;
    page.element.style.transform = '';
    schedule();
  };

  /**
   * Puts the live page's hit area under the live node. The draw matrix maps the page's
   * default-size snapshot (CSS px x dpr) to canvas pixels. A page promoted this frame has no
   * paint record yet, so it is positioned on the next frame.
   */
  const positionLivePage = () => {
    if (!live || livePositioned) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const { zoom } = camera;
    const drawn = new DOMMatrix([
      zoom,
      0,
      0,
      zoom,
      ((live.rect.x - camera.x) * zoom - live.pageX * zoom) * dpr,
      ((live.rect.y - camera.y) * zoom - live.pageY * zoom) * dpr,
    ]);
    try {
      live.page.element.style.transform = canvas
        .getElementTransform(live.page.element, drawn)
        .toString();
      live.element.style.pointerEvents = 'auto';
      livePositioned = true;
    } catch {
      schedule();
    }
  };

  /** Moves the hit-test target to `node`: its page is registered and positioned under it. */
  const setLive = (node: Node | null) => {
    if (node === live) return;
    const previous = live;
    live = node;
    if (previous) {
      previous.element.style.pointerEvents = 'none';
      clearTimeout(lingerTimer);
      const earlier = lingering;
      lingering = previous;
      if (earlier && earlier !== previous) {
        earlier.dirty = true;
        unpin(earlier.page);
      }
      lingerTimer = window.setTimeout(() => {
        const last = lingering;
        if (!last) return;
        lingering = null;
        last.dirty = true;
        unpin(last.page);
      }, LINGER_MS);
      unpin(previous.page);
    }
    if (!node) return;
    const { page } = node;
    page.setDrawable(true, frameNumber);
    if (!page.registered) {
      canvas.updateElementGeometry(page.element, {});
      page.registered = true;
    }
    livePositioned = false;
    positionLivePage();
    schedule();
  };

  /** Makes the topmost node under the last pointer position live. */
  const pickLive = () => {
    if (!pointer) return setLive(null);
    const point = screenToWorld(camera, pointer);
    let hit: Node | null = null;
    for (const node of nodes.values()) if (containsPoint(node.rect, point)) hit = node;
    setLive(hit);
  };

  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    // A press in progress belongs to the live node (text selection, sliders) or to a pan.
    if (event.buttons === 0) pickLive();
  };
  const onPointerLeave = () => {
    pointer = null;
    setLive(null);
  };
  const onFocusIn = (event: FocusEvent) => {
    const node = nodeOf(event.target as HTMLElement) ?? null;
    if (node === focused) return;
    const previous = focused;
    focused = node;
    if (previous) {
      previous.dirty = true;
      unpin(previous.page);
    }
    if (node) {
      node.page.setDrawable(true, frameNumber);
      node.dirty = true;
      schedule();
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget && canvas.contains(event.relatedTarget as globalThis.Node)) return;
    const previous = focused;
    focused = null;
    if (previous) {
      previous.dirty = true;
      unpin(previous.page);
    }
  };
  // An image that finishes loading changes pixels without changing the DOM.
  const onResourceLoad = (event: Event) => {
    const node = nodeOf(event.target as HTMLElement);
    if (!node) return;
    node.dirty = true;
    schedule();
  };
  canvas.addEventListener('load', onResourceLoad, true);
  // Snapshots taken before a web font arrived show the fallback font.
  const onFontsLoaded = () => {
    for (const node of nodes.values()) node.dirty = true;
    schedule();
  };
  document.fonts.addEventListener('loadingdone', onFontsLoaded);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('focusin', onFocusIn);
  canvas.addEventListener('focusout', onFocusOut);
  // A transition paints without touching the DOM, so a click (from a person or from script)
  // would leave a half-finished frame. A readable node in view that was just used keeps its page
  // pinned and redrawn on every paint until its transitions are over. Content that animates on
  // its own, like a looping indicator, keeps the cheaper refresh on mutations: pinning it would
  // repaint its whole page every frame. A deadline ends the pin, transitions in parked pages
  // never fire transitionend.
  const usedAt = new WeakMap<Node, number>();
  const onUse = (event: Event) => {
    const node = nodeOf(event.target as HTMLElement);
    if (node) usedAt.set(node, performance.now());
  };
  const transitionMs = (element: Element) => {
    const style = getComputedStyle(element);
    const seconds = (list: string) => list.split(',').map((value) => parseFloat(value) || 0);
    const durations = seconds(style.transitionDuration);
    const delays = seconds(style.transitionDelay);
    const longest = Math.max(...durations.map((d, i) => d + (delays[i % delays.length] ?? 0)));
    return Math.min(1000, longest * 1000);
  };
  const onTransitionRun = (event: Event) => {
    const node = nodeOf(event.target as HTMLElement);
    const now = performance.now();
    if (!node || now - (usedAt.get(node) ?? -Infinity) > USED_MS) return;
    if (!intersects(node.rect, viewNow())) return;
    if (Math.max(node.rect.width, node.rect.height) * camera.zoom < SMALL_NODE_PX) return;
    const ms = transitionMs(event.target as Element) + 32;
    const end = now + ms;
    if ((transitioning.get(node) ?? 0) >= end) return;
    transitioning.set(node, end);
    node.dirty = true;
    schedule();
    setTimeout(() => {
      if (transitioning.get(node) !== end) return;
      transitioning.delete(node);
      node.dirty = true;
      unpin(node.page);
      schedule();
    }, ms);
  };
  for (const type of USE_EVENTS) canvas.addEventListener(type, onUse, true);
  canvas.addEventListener('transitionrun', onTransitionRun);

  const setCamera = (next: Camera) => {
    camera = next;
    lastCameraChange = performance.now();
    // A moving canvas has no hover; the node under a still pointer becomes live once it rests.
    setLive(null);
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      pickLive();
      schedule();
    }, SETTLE_MS);
    schedule();
    options.onCameraChange?.(camera);
  };
  const unbindInput = bindCameraInput(surface, () => camera, setCamera);

  const placeNode = (element: HTMLElement, rect: Rect) => {
    let slot = openPage?.place(rect.width, rect.height) ?? null;
    if (!slot) {
      const page = new Page(
        Math.max(pageSize, Math.ceil(rect.width)),
        Math.max(pageSize, Math.ceil(rect.height)),
      );
      pages.set(page, new Set());
      pageByElement.set(page.element, page);
      canvas.append(page.element);
      // Oversized nodes get a page of their own and leave the open page as it was.
      if (page.width === pageSize && page.height === pageSize) openPage = page;
      slot = page.place(rect.width, rect.height)!;
    }
    Object.assign(element.style, {
      position: 'absolute',
      left: `${slot.x}px`,
      top: `${slot.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    slot.page.element.append(element);
    return slot;
  };

  const releaseNode = (node: Node) => {
    const members = pages.get(node.page)!;
    members.delete(node);
    node.page.release();
    if (members.size === 0 && node.page !== openPage) {
      pages.delete(node.page);
      pageByElement.delete(node.page.element);
      node.page.element.remove();
    }
  };

  /**
   * Moves a node onto a page of its own. Chrome rasterizes a snapshot's whole source element at
   * the requested scale before cropping, so zoomed in, a crop from a shared page pays for every
   * node on it: about 100 ms at 16x for two dozen app screens, under 10 ms for one.
   * `moveBefore` keeps focus, running transitions and other DOM state across the move.
   */
  const lift = (node: Node) => {
    const previous = node.page;
    const wasLive = live === node;
    if (wasLive) setLive(null);
    const page = new Page(Math.ceil(node.rect.width), Math.ceil(node.rect.height));
    pages.set(page, new Set());
    pageByElement.set(page.element, page);
    canvas.append(page.element);
    page.place(node.rect.width, node.rect.height);
    const target = page.element as HTMLElement & {
      moveBefore?: (child: globalThis.Node, before: globalThis.Node | null) => void;
    };
    if (target.moveBefore) target.moveBefore(node.element, null);
    else target.append(node.element);
    node.element.style.left = '0px';
    node.element.style.top = '0px';
    releaseNode(node);
    node.page = page;
    node.pageX = 0;
    node.pageY = 0;
    node.solo = true;
    pages.get(page)!.add(node);
    // The whole snapshot is still valid: the node's pixels did not change, only its page.
    if (pages.has(previous) && !isPinned(previous)) {
      unpin(previous);
      previous.setDrawable(false, frameNumber);
    }
    if (wasLive) pickLive();
  };

  const attach = (node: Node) => {
    const slot = placeNode(node.element, node.rect);
    node.page = slot.page;
    node.pageX = slot.x;
    node.pageY = slot.y;
    node.slot = null;
    node.thumb = null;
    node.solo = false;
    node.dirty = true;
    pages.get(slot.page)!.add(node);
  };

  return {
    mode: 'gpu',
    surface,
    addNode(element, rect) {
      Object.assign(element.style, {
        boxSizing: 'border-box',
        contain: 'strict',
        overflow: 'hidden',
        pointerEvents: 'none',
      });
      const node = {
        element,
        rect,
        slotScale: 0,
        thumb: null,
        thumbStale: false,
        thumbAt: -Infinity,
        shown: 0,
        shownFrame: -1,
        targetScale: 0,
        tiles: [] as Tile[],
        preview: null,
        previewRect: null,
        previewScale: 0,
        previewTarget: null,
        previewTargetScale: 0,
        changedAt: -Infinity,
        refreshedAt: -Infinity,
        wholeStale: false,
        solo: false,
        priority: 0,
      } as Node;
      attach(node);
      nodes.set(element, node);
      schedule();
    },
    updateNode(element, rect) {
      const node = nodes.get(element);
      if (!node) return;
      const resized = node.rect.width !== rect.width || node.rect.height !== rect.height;
      node.rect = rect;
      ringRects.clear();
      if (resized) {
        if (live === node) setLive(null);
        releaseNode(node);
        attach(node);
      }
      schedule();
    },
    removeNode(element) {
      const node = nodes.get(element);
      if (!node) return;
      if (live === node) setLive(null);
      if (lingering === node) lingering = null;
      if (focused === node) focused = null;
      transitioning.delete(node);
      selection.delete(element);
      nodes.delete(element);
      releaseNode(node);
      element.remove();
      schedule();
    },
    getNodeRect: (element) => {
      const node = nodes.get(element);
      return node ? { ...node.rect } : null;
    },
    getNodesIn(rect) {
      const hits: HTMLElement[] = [];
      for (const node of nodes.values()) if (intersects(node.rect, rect)) hits.push(node.element);
      return hits;
    },
    getNodeOf: (element) => nodeOfElement(nodes, element),
    getElementRect(element) {
      const rect = ringRect(element);
      return rect ? { ...rect } : null;
    },
    getElementAt(point) {
      // The last node added draws on top.
      let top: Node | null = null;
      for (const node of nodes.values()) if (containsPoint(node.rect, point)) top = node;
      return top ? elementInNode(top.element, top.rect, point) : null;
    },
    setSelection(elements) {
      selection = new Set(elements);
      ringRects.clear();
      schedule();
    },
    setHover(element) {
      if (element === hovered) return;
      hovered = element;
      ringRects.clear();
      schedule();
    },
    screenToWorld: (point) => screenToWorld(camera, point),
    worldToScreen: (point) => worldToScreen(camera, point),
    getCamera: () => camera,
    setCamera,
    invalidate: onFontsLoaded,
    setBackground(color) {
      [renderer.background, renderer.placeholder] = colorsFor(color);
      schedule();
    },
    fit(padding) {
      const bounds = boundsOf([...nodes.values()].map((node) => node.rect));
      if (bounds) setCamera(fitCamera(bounds, canvas.clientWidth, canvas.clientHeight, padding));
    },
    getStats: () => ({
      mode: 'gpu',
      nodes: nodes.size,
      visible: stats.visible,
      pending: stats.pending,
      rasterizedLastFrame: stats.rasterizedLastFrame,
      rasterCallsLastFrame: stats.rasterCallsLastFrame,
      rasterMs: stats.rasterMs,
      pages: pages.size,
      drawablePages: [...pages.keys()].filter((page) => page.drawable).length,
      atlasLayersUsed: atlas.usedLayers,
      frameMs: stats.frameMs,
      frames: stats.frames,
      lostPixels: stats.lostPixels,
      lostDetail: stats.lostDetail,
      thumbnailFill: atlas.pinnedFill,
      onThumbnail: stats.onThumbnail,
      needs: stats.needs,
    }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      clearTimeout(lingerTimer);
      clearTimeout(contentTimer);
      mutations.disconnect();
      document.fonts.removeEventListener('loadingdone', onFontsLoaded);
      canvas.removeEventListener('load', onResourceLoad, true);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('focusin', onFocusIn);
      canvas.removeEventListener('focusout', onFocusOut);
      canvas.removeEventListener('transitionrun', onTransitionRun);
      for (const type of USE_EVENTS) canvas.removeEventListener(type, onUse, true);
      unbindInput();
      resizeObserver.disconnect();
      canvas.onpaint = null;
      surface.remove();
      renderer.destroy();
      atlas.destroy();
      device.destroy();
    },
  };
}
