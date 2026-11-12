/** A rectangle in one layer of the atlas texture array, in texels. */
export interface AtlasSlot {
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bumped when the layer is evicted; a slot is valid while it matches the layer's generation. */
  generation: number;
}

interface Shelf {
  y: number;
  height: number;
  x: number;
}

interface Layer {
  shelves: Shelf[];
  nextY: number;
  generation: number;
  /** Frame number of the last allocation in, or draw from, this layer; the stalest is evicted. */
  lastUsed: number;
  /** Frame number of the last allocation; a layer filled this frame is never evicted. */
  lastAllocated: number;
}

const PADDING = 1;

/**
 * Shelf packer over the layers of one texture array. Nothing is freed individually: when every
 * layer is full, the least recently used layer is recycled. Its slots that are still on screen
 * (`keep`) are first copied into a spare layer on the GPU, so they never flash; the rest become
 * invalid and are rasterized again the next time they are visible. The recycled layer becomes
 * the new spare.
 *
 * Layer 0 is pinned: it holds small thumbnails that are never recycled (`allocatePinned`), so
 * every node keeps some pixels however much the other layers churn.
 */
export class Atlas {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly size: number;
  /** Slots to rescue when their layer is recycled, most important first. */
  keep: () => Iterable<AtlasSlot | null> = () => [];
  private layers: Layer[];
  private spare: number;
  private frame = 0;

  constructor(
    private readonly device: GPUDevice,
    size: number,
    layerCount: number,
  ) {
    this.size = size;
    this.texture = device.createTexture({
      label: 'gpucanvas atlas',
      size: [size, size, layerCount],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.view = this.texture.createView({ dimension: '2d-array' });
    this.layers = Array.from({ length: layerCount }, () => ({
      shelves: [],
      nextY: 0,
      generation: 0,
      lastUsed: -1,
      lastAllocated: -1,
    }));
    this.spare = layerCount - 1;
  }

  /** The layer `allocatePinned` fills; it is never recycled. */
  readonly pinned = 0;

  get layerCount() {
    return this.layers.length;
  }

  get usedLayers() {
    return this.layers.filter((layer, index) => index !== this.spare && layer.nextY > 0).length;
  }

  /** How much of the pinned layer is taken, 0 to 1. */
  get pinnedFill() {
    return this.layers[this.pinned].nextY / this.size;
  }

  nextFrame() {
    this.frame++;
  }

  /** Marks a layer as drawn from this frame, so eviction prefers others. */
  touch(layer: number) {
    this.layers[layer].lastUsed = this.frame;
  }

  isValid(slot: AtlasSlot | null): slot is AtlasSlot {
    return slot !== null && this.layers[slot.layer].generation === slot.generation;
  }

  allocate(width: number, height: number): AtlasSlot | null {
    const w = Math.ceil(width) + PADDING;
    const h = Math.ceil(height) + PADDING;
    if (w > this.size || h > this.size) return null;
    for (let index = 0; index < this.layers.length; index++) {
      if (index === this.spare || index === this.pinned) continue;
      const slot = this.allocateIn(index, w, h);
      if (slot) return slot;
    }
    // Never recycle a layer filled this frame: its slots are about to be drawn.
    let stalest = -1;
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      if (index === this.spare || index === this.pinned || layer.lastAllocated === this.frame)
        continue;
      if (stalest < 0 || layer.lastUsed < this.layers[stalest].lastUsed) stalest = index;
    }
    if (stalest < 0) return null;
    const target = this.recycle(stalest);
    return this.allocateIn(target, w, h);
  }

  /** Space in the pinned layer, or null once it is full. */
  allocatePinned(width: number, height: number): AtlasSlot | null {
    return this.allocateIn(this.pinned, Math.ceil(width) + PADDING, Math.ceil(height) + PADDING);
  }

  isPinned(slot: AtlasSlot | null) {
    return slot !== null && slot.layer === this.pinned;
  }

  /** Moves the kept slots of `index` into the spare layer, wipes `index`, and swaps the two. */
  private recycle(index: number) {
    const target = this.spare;
    const from = this.layers[index];
    this.evict(target);
    const encoder = this.device.createCommandEncoder({ label: 'gpucanvas atlas rescue' });
    let copies = 0;
    const seen = new Set<AtlasSlot>();
    for (const slot of this.keep()) {
      if (!slot || seen.has(slot) || slot.layer !== index || slot.generation !== from.generation) {
        continue;
      }
      seen.add(slot);
      // Slots cut from a whole page start at fractional texels; copy whole texels around them.
      const x0 = Math.floor(slot.x);
      const y0 = Math.floor(slot.y);
      const x1 = Math.min(this.size, Math.ceil(slot.x + slot.width));
      const y1 = Math.min(this.size, Math.ceil(slot.y + slot.height));
      const moved = this.allocateIn(target, x1 - x0 + PADDING, y1 - y0 + PADDING);
      if (!moved) break;
      encoder.copyTextureToTexture(
        { texture: this.texture, origin: { x: x0, y: y0, z: index } },
        { texture: this.texture, origin: { x: moved.x, y: moved.y, z: target } },
        [x1 - x0, y1 - y0, 1],
      );
      copies++;
      slot.layer = target;
      slot.x = moved.x + (slot.x - x0);
      slot.y = moved.y + (slot.y - y0);
      slot.generation = moved.generation;
    }
    if (copies > 0) this.device.queue.submit([encoder.finish()]);
    this.evict(index);
    this.spare = index;
    return target;
  }

  private allocateIn(index: number, w: number, h: number): AtlasSlot | null {
    const layer = this.layers[index];
    let shelf = layer.shelves.find(
      (candidate) =>
        candidate.height >= h && candidate.height <= h * 1.5 && candidate.x + w <= this.size,
    );
    if (!shelf) {
      if (layer.nextY + h > this.size) return null;
      shelf = { y: layer.nextY, height: h, x: 0 };
      layer.shelves.push(shelf);
      layer.nextY += h;
    }
    const slot = {
      layer: index,
      x: shelf.x,
      y: shelf.y,
      width: w - PADDING,
      height: h - PADDING,
      generation: layer.generation,
    };
    shelf.x += w;
    layer.lastUsed = this.frame;
    layer.lastAllocated = this.frame;
    return slot;
  }

  private evict(index: number) {
    const layer = this.layers[index];
    layer.shelves = [];
    layer.nextY = 0;
    layer.generation++;
  }

  destroy() {
    this.texture.destroy();
  }
}
