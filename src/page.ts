/**
 * A page is one `drawable` container holding many nodes, laid out side by side in CSS pixels.
 * The browser records a page as one snapshot, so a single `drawElementImageToTexture` call can
 * rasterize every node on it, and a source rectangle crops out one node when only it changed.
 * Each call costs roughly a quarter millisecond on top of its pixels, so batching nodes into
 * pages is what makes a 10,000-node overview fill in a second instead of a minute.
 */

/** Space between nodes on a page, so filtering at a node's edge never reads its neighbor. */
const GAP = 4;

interface Shelf {
  y: number;
  height: number;
  x: number;
}

export interface PageSlot {
  page: Page;
  x: number;
  y: number;
}

export class Page {
  readonly element: HTMLDivElement;
  readonly width: number;
  readonly height: number;
  /** Nodes currently placed on this page. */
  count = 0;
  /** Has the `drawable` attribute and is rendered; parked pages use `content-visibility: hidden`. */
  drawable = false;
  /** Frame in which the page became drawable. Its snapshot exists from that frame's paint on. */
  promotedFrame = -1;
  /** Kept drawable for the live (hit-testable) or focused node. */
  pinned = false;
  /** Registered for hit testing with `updateElementGeometry`. */
  registered = false;
  private shelves: Shelf[] = [];
  private nextY = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.element = document.createElement('div');
    this.element.dataset.gpucanvasPage = '';
    Object.assign(this.element.style, {
      position: 'relative',
      width: `${width}px`,
      height: `${height}px`,
      // Pages share the canvas origin: each one pulls the next back up by its own height.
      marginBottom: `${-height}px`,
      contain: 'strict',
      overflow: 'hidden',
      // Parked pages keep their layout but skip style, layout updates and paint. Unlike
      // `display: none`, their nodes keep their size, so components that measure themselves
      // (charts with a ResizeObserver) don't re-render empty every time a page parks.
      contentVisibility: 'hidden',
    });
  }

  /** Reserves a spot for a `width` x `height` node, or returns null when the page is full. */
  place(width: number, height: number): PageSlot | null {
    const w = Math.ceil(width) + GAP;
    const h = Math.ceil(height) + GAP;
    if (w > this.width + GAP || h > this.height + GAP) return null;
    let shelf = this.shelves.find(
      (candidate) =>
        candidate.height >= h &&
        candidate.height <= h * 1.25 &&
        candidate.x + w <= this.width + GAP,
    );
    if (!shelf) {
      if (this.nextY + h > this.height + GAP) return null;
      shelf = { y: this.nextY, height: h, x: 0 };
      this.shelves.push(shelf);
      this.nextY += h;
    }
    const slot = { page: this, x: shelf.x, y: shelf.y };
    shelf.x += w;
    this.count++;
    return slot;
  }

  release() {
    this.count--;
  }

  setDrawable(drawable: boolean, frame: number) {
    if (this.drawable === drawable) return;
    this.drawable = drawable;
    this.registered = false;
    if (drawable) {
      this.promotedFrame = frame;
      this.element.style.contentVisibility = '';
      this.element.setAttribute('drawable', '');
    } else {
      this.element.removeAttribute('drawable');
      this.element.style.contentVisibility = 'hidden';
      this.element.style.transform = '';
    }
  }
}
