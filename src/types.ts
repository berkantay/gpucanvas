import type { Camera, Rect } from './camera';

export type GpuCanvasMode = 'gpu' | 'dom';

export interface GpuCanvasOptions {
  /** `auto` uses the GPU path when WebGPU and HTML-in-Canvas are available, otherwise DOM. */
  mode?: 'auto' | GpuCanvasMode;
  /** Canvas background, any CSS color. */
  background?: string;
  /** Outline of selected nodes, any CSS color. Default `#4f8cff`. */
  selectionColor?: string;
  camera?: Camera;
  /** Side of each atlas layer in texels. Default 4096, capped by the device. */
  atlasSize?: number;
  /** Atlas layers; each 4096 layer costs 64 MB of GPU memory. One holds thumbnails. Default 5. */
  atlasLayers?: number;
  /** Most snapshot pixels rasterized per frame; the rest wait for later frames. Default 24M. */
  rasterPixelBudget?: number;
  /** Most raster calls per frame; one call covers a whole page or one node. Default 12. */
  maxRastersPerFrame?: number;
  /** Main-thread milliseconds a frame may spend issuing rasters. Default 6. */
  rasterTimeBudgetMs?: number;
  /** Side of a page, the unit nodes are batched into for rasterizing, in CSS pixels. Default 2048. */
  pageSize?: number;
  onCameraChange?: (camera: Camera) => void;
}

export interface GpuCanvasStats {
  mode: GpuCanvasMode;
  nodes: number;
  visible: number;
  /** Visible nodes still waiting for a snapshot at the current zoom. */
  pending: number;
  /** Nodes that got fresh pixels in the last frame. */
  rasterizedLastFrame: number;
  /** Raster calls in the last frame (gpu only). */
  rasterCallsLastFrame?: number;
  /** Main-thread milliseconds the last frame spent issuing rasters. */
  rasterMs: number;
  /** Pages nodes are batched into, and how many are drawable right now (gpu only). */
  pages?: number;
  drawablePages?: number;
  atlasLayersUsed: number;
  /** Main-thread milliseconds the last composite took. */
  frameMs: number;
  /** Frames composited since creation (gpu only). An idle canvas draws none. */
  frames?: number;
  /** Times a visible node that had pixels showed a placeholder instead: visible flicker. */
  lostPixels?: number;
  /** Times a sharp zoomed-in node fell back to its blurrier whole snapshot. */
  lostDetail?: number;
  /** Share of the thumbnail layer in use, 0 to 1 (gpu only). */
  thumbnailFill?: number;
  /** Visible nodes showing only their thumbnail while a sharper snapshot is drawn (gpu only). */
  onThumbnail?: number;
  /** Visible nodes the last frame planned to rasterize: missing, dirty, blurry, oversampled. */
  needs?: number[];
}

export interface GpuCanvas {
  readonly mode: GpuCanvasMode;
  /** The element that receives camera input; the host's only child. */
  readonly surface: HTMLElement;
  /** Places `element` on the canvas at `rect` (world units). The element keeps its own DOM and events. */
  addNode(element: HTMLElement, rect: Rect): void;
  updateNode(element: HTMLElement, rect: Rect): void;
  removeNode(element: HTMLElement): void;
  /** Where `element` sits on the canvas, in world units, or null when it is not a node. */
  getNodeRect(element: HTMLElement): Rect | null;
  /** Nodes that overlap `rect` (world units), such as the ones under a selection box. */
  getNodesIn(rect: Rect): HTMLElement[];
  /** Outlines these nodes as selected, replacing the previous selection. Pass `[]` to clear. */
  setSelection(elements: Iterable<HTMLElement>): void;
  getCamera(): Camera;
  setCamera(camera: Camera): void;
  /**
   * Redraws every node. Call it after a change the nodes' own DOM does not show, such as a theme
   * class on `<html>` or a web font finishing loading.
   */
  invalidate(): void;
  /** Changes the canvas background, any CSS color. */
  setBackground(color: string): void;
  /** Fits all nodes in view. */
  fit(padding?: number): void;
  getStats(): GpuCanvasStats;
  destroy(): void;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
export const DEFAULT_SELECTION_COLOR = '#4f8cff';
/** Width of the selection outline, in CSS pixels at any zoom. */
export const SELECTION_WIDTH = 2;
