import { createDomCanvas } from './dom-backend';
import { createGpuCanvas as createGpuBackend, supportsGpuCanvas } from './gpu-backend';
import type { GpuCanvas, GpuCanvasOptions } from './types';

export type { AgentElement, AgentView, DescribeOptions } from './agent';
export { createAgentView } from './agent';
export type { Camera, Point, Rect } from './camera';
export { fitCamera, screenToWorld, worldToScreen, zoomAt } from './camera';
export type { Editor, EditorOptions, TransformEvent } from './editor';
export { bindEditor } from './editor';
export type { EditorPick, Layer } from './layers';
export type { Effect, EffectDefinition } from './effects';
export { defineEffect, EFFECTS as effects } from './effects';
export type { CursorMark, Mark, Marks } from './marks';
export { createMarks } from './marks';
export type { Filmstrip, FilmstripFrame, ImageDiff } from './snapshots';
export { diffImages, recordFilmstrip, toBlob } from './snapshots';
export type { AnimateEffectOptions, Easing } from './transitions';
export { animateEffect, easeInOut, swapNodes } from './transitions';
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
