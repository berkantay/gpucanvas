import type { Rect } from './camera';
import type { GpuCanvas } from './types';

/** A snapshot as an image file, PNG by default. */
export function toBlob(image: ImageData, type = 'image/png', quality?: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type, quality });
}

export interface ImageDiff {
  /** Pixels that differ by more than the threshold, out of `total`. */
  changed: number;
  total: number;
  /** The smallest rect around every changed pixel, in pixels of the images, or null. */
  bounds: Rect | null;
  /** `after` faded, with the changed pixels in `color` on top. */
  image: ImageData;
}

/**
 * Where two snapshots of the same node differ. Pixels count as changed when a channel moves by
 * more than `threshold` (0 to 255). Images of different sizes compare over the larger one, and
 * what only one of them covers counts as changed.
 */
export function diffImages(
  before: ImageData,
  after: ImageData,
  { threshold = 24, color = [255, 64, 96] as [number, number, number] } = {},
): ImageDiff {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const out = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const read = (image: ImageData, x: number, y: number) =>
    x < image.width && y < image.height ? (y * image.width + x) * 4 : -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = read(before, x, y);
      const b = read(after, x, y);
      const o = (y * width + x) * 4;
      let differs = a < 0 || b < 0;
      if (!differs) {
        for (let c = 0; c < 4 && !differs; c++) {
          differs = Math.abs(before.data[a + c] - after.data[b + c]) > threshold;
        }
      }
      if (differs) {
        changed++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        out[o] = color[0];
        out[o + 1] = color[1];
        out[o + 2] = color[2];
        out[o + 3] = 255;
      } else {
        // Faded toward white so the changes stand out.
        for (let c = 0; c < 3; c++) out[o + c] = 255 - (255 - after.data[b + c]) * 0.25;
        out[o + 3] = after.data[b + 3];
      }
    }
  }
  return {
    changed,
    total: width * height,
    bounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    image: new ImageData(out, width, height),
  };
}

export interface FilmstripFrame {
  /** When the frame was taken, from performance.now(). */
  at: number;
  image: ImageData;
}

export interface Filmstrip {
  readonly frames: readonly FilmstripFrame[];
  stop(): void;
}

/**
 * Keeps a snapshot of `node` after each change to its content, once the change has settled.
 * Starts with one of how it looks now. Keeps the latest `max` frames.
 */
export function recordFilmstrip(
  canvas: Pick<GpuCanvas, 'snapshot'>,
  node: HTMLElement,
  {
    scale = 0.25,
    max = 30,
    settleMs = 400,
    onFrame,
  }: {
    scale?: number;
    max?: number;
    settleMs?: number;
    onFrame?: (frame: FilmstripFrame, frames: readonly FilmstripFrame[]) => void;
  } = {},
): Filmstrip {
  const frames: FilmstripFrame[] = [];
  let stopped = false;
  let timer = 0;
  const take = () => {
    canvas
      .snapshot(node, { scale })
      .then((image) => {
        if (stopped) return;
        const frame = { at: performance.now(), image };
        frames.push(frame);
        if (frames.length > max) frames.shift();
        onFrame?.(frame, frames);
      })
      .catch(() => {});
  };
  const observer = new MutationObserver((records) => {
    // The canvas writes style on the node itself to place it; only its content counts.
    if (records.every((record) => record.type === 'attributes' && record.target === node)) return;
    clearTimeout(timer);
    timer = window.setTimeout(take, settleMs);
  });
  observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
  take();
  return {
    frames,
    stop() {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
    },
  };
}
