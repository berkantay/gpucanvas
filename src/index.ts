import { createDomCanvas } from './dom-backend';
import { createGpuCanvas as createGpuBackend, supportsGpuCanvas } from './gpu-backend';
import type { GpuCanvas, GpuCanvasOptions } from './types';

export type { Camera, Point, Rect } from './camera';
export { fitCamera, screenToWorld, worldToScreen, zoomAt } from './camera';
export type { Selection, SelectionOptions, SelectionPick } from './selection';
export { bindSelection } from './selection';
export type { GpuCanvas, GpuCanvasMode, GpuCanvasOptions, GpuCanvasStats } from './types';
export { supportsGpuCanvas };

/**
 * Creates an infinite canvas inside `host`. Uses WebGPU + HTML-in-Canvas when the browser has
 * both (Chrome 157+), and plain DOM transforms everywhere else; the API is the same.
 */
export async function createGpuCanvas(
  host: HTMLElement,
  options: GpuCanvasOptions = {},
): Promise<GpuCanvas> {
  const mode = options.mode ?? 'auto';
  if (mode === 'dom' || (mode === 'auto' && !supportsGpuCanvas())) {
    return createDomCanvas(host, options);
  }
  try {
    return await createGpuBackend(host, options);
  } catch (error) {
    if (mode === 'gpu') throw error;
    return createDomCanvas(host, options);
  }
}
