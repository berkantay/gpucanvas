import './dom';
import { expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { GpuCanvas as GpuCanvasInstance, GpuCanvasOptions } from '../src/index';
import { CanvasNode, GpuCanvas } from '../src/react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('<GpuCanvas> passes snapshotFallback through', async () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData;
  const fallback = mock<NonNullable<GpuCanvasOptions['snapshotFallback']>>(async () => image);
  let canvas: GpuCanvasInstance | null = null;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <GpuCanvas mode="dom" snapshotFallback={fallback} onReady={(ready) => (canvas = ready)}>
        <CanvasNode x={0} y={0} width={200} height={100} className="card" />
      </GpuCanvas>,
    );
  });
  const node = host.querySelector<HTMLElement>('.card')!;
  expect(await canvas!.snapshot(node, { scale: 3 })).toBe(image);
  expect(fallback).toHaveBeenCalledWith(node, { scale: 3 });
  await act(async () => root.unmount());
});
