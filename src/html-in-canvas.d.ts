// HTML-in-Canvas (WICG, shipped in Chrome 157). Not in lib.dom yet.
// https://github.com/WICG/html-in-canvas#idl-changes

interface CanvasPaintEvent extends Event {
  readonly changedElements: readonly Element[];
}

interface UpdateElementGeometryOptions {
  preserveHitTestOrder?: boolean;
  canvasClip?: DOMRectInit;
  canvasTransform?: DOMMatrixInit;
}

interface HTMLCanvasElement {
  content: 'fallback' | 'drawable';
  onpaint: ((this: HTMLCanvasElement, event: CanvasPaintEvent) => void) | null;
  requestPaint(): void;
  updateElementGeometry(element: Element, options?: UpdateElementGeometryOptions): void;
  clearElementGeometry(element: Element): void;
  /**
   * Chrome 157: given where the element was drawn (canvas pixels), returns the CSS transform
   * that puts the live element in the same place, for hit testing and accessibility.
   */
  getElementTransform(element: Element, drawTransform: DOMMatrix): DOMMatrix;
}

interface GPUDrawElementImageSource {
  source: Element;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface GPUDrawElementImageDestination extends GPUTexelCopyTextureInfo {
  size?: GPUExtent3DStrict;
  colorSpace?: PredefinedColorSpace;
  /** Defaults to false. */
  premultipliedAlpha?: boolean;
}

interface GPUQueue {
  drawElementImageToTexture(
    source: GPUDrawElementImageSource,
    destination: GPUDrawElementImageDestination,
  ): void;
}
