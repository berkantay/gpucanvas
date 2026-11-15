import { toBlob, type GpuCanvas, type GpuCanvasOptions } from '../src/index';

/**
 * Draws snapshots on the DOM backend with SnapDOM, so `S` and the agent view's `capture` work in
 * Firefox, Safari and on iOS too. It loads on the first snapshot; the GPU path never asks.
 */
export const snapshotFallback: GpuCanvasOptions['snapshotFallback'] = async (node, { scale }) => {
  const { snapdom } = await import('@zumer/snapdom');
  // `scale` already counts the device pixel ratio, so dpr 1 keeps it from applying twice.
  const canvas = await snapdom.toCanvas(node, { scale, dpr: 1 });
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
};

/** Downloads `node` as a PNG at twice its size. */
export async function saveSnapshot(canvas: GpuCanvas, node: HTMLElement) {
  const image = await canvas.snapshot(node, { scale: 2 }).catch((error: unknown) => {
    console.warn('[gpucanvas] snapshot failed', error);
    return null;
  });
  if (!image) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(await toBlob(image));
  link.download = 'screen.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
