import './dom';
import { afterEach, expect, mock, test } from 'bun:test';
import { createGpuCanvas, type GpuCanvas, type GpuCanvasOptions } from '../src/index';

type Fallback = NonNullable<GpuCanvasOptions['snapshotFallback']>;

const pixels = (width = 1, height = 1) =>
  ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData;

let canvas: GpuCanvas | null = null;
afterEach(() => {
  canvas?.destroy();
  canvas = null;
  document.body.replaceChildren();
});

/** A DOM canvas with one node that holds a button. */
async function setup(snapshotFallback?: Fallback) {
  const host = document.createElement('div');
  document.body.append(host);
  canvas = await createGpuCanvas(host, { mode: 'dom', snapshotFallback });
  const node = document.createElement('div');
  const button = document.createElement('button');
  node.append(button);
  canvas.addNode(node, { x: 0, y: 0, width: 200, height: 100 });
  // The boxes that outline elements inside nodes live in the world's first child.
  const overlay = node.parentElement!.firstElementChild as HTMLElement;
  return { canvas, node, button, overlay };
}

test('rejects without a fallback', async () => {
  const { canvas, node } = await setup();
  expect(canvas.snapshot(node)).rejects.toThrow('snapshotFallback');
});

test('rejects an element that is not a node', async () => {
  const fallback = mock<Fallback>(async () => pixels());
  const { canvas, button } = await setup(fallback);
  expect(canvas.snapshot(button)).rejects.toThrow('Not a node');
  expect(fallback).not.toHaveBeenCalled();
});

test('returns what the fallback draws, at the scale asked for', async () => {
  const image = pixels(400, 200);
  const fallback = mock<Fallback>(async () => image);
  const { canvas, node } = await setup(fallback);
  expect(await canvas.snapshot(node, { scale: 2 })).toBe(image);
  expect(fallback).toHaveBeenCalledWith(node, { scale: 2 });
});

test('the scale defaults to the device pixel ratio', async () => {
  const fallback = mock<Fallback>(async () => pixels());
  const { canvas, node } = await setup(fallback);
  await canvas.snapshot(node);
  expect(fallback).toHaveBeenCalledWith(node, { scale: devicePixelRatio });
});

test('the selection outline stays out of the image and comes back', async () => {
  let during = 'not called';
  const { canvas, node } = await setup(async (target) => {
    during = target.style.outline;
    return pixels();
  });
  canvas.setSelection([node]);
  expect(node.style.outline).not.toBe('');
  await canvas.snapshot(node);
  expect(during).toBe('');
  expect(node.style.outline).not.toBe('');
});

test('the hover outline stays out of the image and comes back', async () => {
  let during = 'not called';
  const { canvas, node } = await setup(async (target) => {
    during = target.style.outline;
    return pixels();
  });
  canvas.setHover(node);
  await canvas.snapshot(node);
  expect(during).toBe('');
  expect(node.style.outline).not.toBe('');
});

test('outlines of elements inside a node stay out of the image and come back', async () => {
  let during = 'not called';
  const { canvas, node, button, overlay } = await setup(async () => {
    during = overlay.style.visibility;
    return pixels();
  });
  canvas.setSelection([button]);
  expect(overlay.children.length).toBe(1);
  await canvas.snapshot(node);
  expect(during).toBe('hidden');
  expect(overlay.style.visibility).toBe('');
  expect(overlay.children.length).toBe(1);
});

test('outlines come back when the fallback fails', async () => {
  const { canvas, node, button, overlay } = await setup(async () => {
    throw new Error('could not draw');
  });
  canvas.setSelection([node, button]);
  expect(canvas.snapshot(node)).rejects.toThrow('could not draw');
  await Promise.resolve();
  expect(node.style.outline).not.toBe('');
  expect(overlay.style.visibility).toBe('');
});

test('a selection made during a snapshot shows once it ends', async () => {
  let finish = () => {};
  const { canvas, node } = await setup(
    () => new Promise((resolve) => (finish = () => resolve(pixels()))),
  );
  const snapshot = canvas.snapshot(node);
  canvas.setSelection([node]);
  expect(node.style.outline).toBe('');
  finish();
  await snapshot;
  expect(node.style.outline).not.toBe('');
});

test('snapshots that overlap keep outlines hidden until the last one ends', async () => {
  const finish: (() => void)[] = [];
  const { canvas, node, button, overlay } = await setup(
    () => new Promise((resolve) => finish.push(() => resolve(pixels()))),
  );
  canvas.setSelection([node, button]);
  const first = canvas.snapshot(node);
  const second = canvas.snapshot(node);
  finish[0]();
  await first;
  expect(node.style.outline).toBe('');
  expect(overlay.style.visibility).toBe('hidden');
  finish[1]();
  await second;
  expect(node.style.outline).not.toBe('');
  expect(overlay.style.visibility).toBe('');
});
