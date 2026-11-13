import type { Camera, GpuCanvasStats, Rect } from '../src/index';

/**
 * The engines the benchmark compares, fed the same components and camera path: gpucanvas's GPU
 * backend and its DOM backend, which is how real-HTML design canvases draw today, components moved
 * with a CSS transform.
 */
export type Mode = 'gpu' | 'dom';
export const MODES: Mode[] = ['gpu', 'dom'];
export const MODE_LABEL: Record<Mode, string> = {
  gpu: 'gpucanvas',
  dom: 'DOM canvas',
};

export const parseMode = (value: string | null): Mode =>
  MODES.includes(value as Mode) ? (value as Mode) : 'gpu';

export type StageStats = Omit<GpuCanvasStats, 'mode'> & { mode: Mode };

/** What the benchmark and the HUD need from an engine: its surface, camera, selection and counters. */
export interface Stage {
  readonly mode: Mode;
  readonly surface: HTMLElement;
  getCamera(): Camera;
  setCamera(camera: Camera): void;
  getNodesIn(rect: Rect): HTMLElement[];
  getNodeRect(element: HTMLElement): Rect | null;
  setSelection(elements: Iterable<HTMLElement>): void;
  getStats(): StageStats;
}
