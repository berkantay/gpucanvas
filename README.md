# gpucanvas

Put thousands of live DOM nodes on an infinite canvas and let the GPU pan and zoom them.

![The same 5,000 live React screens as plain DOM (left) and in gpucanvas (right), with each side's frame rate measured live](docs/benchmark.gif)

The same session on both sides: 5,000 live React screens, the same camera path, a message typed and sent. Left, every screen is plain DOM under a CSS transform. Right, gpucanvas. Recorded in Chrome on a MacBook Pro; the frame rates are measured live in each run. Run it yourself with the demo below.

Status: early (0.1). The API can still change.

```sh
npm install gpucanvas
```

```tsx
import { GpuCanvas, CanvasNode } from 'gpucanvas/react';

<GpuCanvas style={{ width: '100vw', height: '100vh' }}>
  {cards.map((card) => (
    <CanvasNode key={card.id} x={card.x} y={card.y} width={240} height={150}>
      <Card {...card} />
    </CanvasNode>
  ))}
</GpuCanvas>;
```

Nodes stay real DOM: React state, events, CSS and accessibility work as usual. Where WebGPU and
HTML-in-Canvas are available (Chrome 157+), nodes are snapshotted into a GPU atlas and drawn in
one instanced draw call. Everywhere else it falls back to a CSS-transformed container with the
same API.

## Run the demo

```sh
bun install
bun run dev        # http://localhost:5199/?mode=gpu&n=10000  (mode: auto | gpu | dom)
```

## How it works

1. Nodes live inside `<canvas content="drawable">`.
2. A node that needs pixels is promoted (`drawable` attribute). In the next paint event its
   snapshot is rasterized with `queue.drawElementImageToTexture` into a texture-array atlas, at a
   power-of-two scale of the zoom.
3. After that the node is parked with `display: none`. Every drawable costs Chrome layout and a
   recording on each rendering update, so only nodes waiting for a raster stay drawable.
4. A MutationObserver marks a node dirty when its content changes, which re-promotes it.
5. Each frame culls nodes against the view and draws every visible one with one instanced quad
   draw. Nodes without a snapshot yet draw as placeholders.
6. While the camera moves, only missing snapshots are rasterized. Blurry ones are upgraded once
   it rests, center first. Zooming out keeps the sharper snapshots.
7. Only the node under the pointer is live (hit-testable). Pans and zooms cost no DOM work.

## Measured (M-series Mac, Chrome 157, DPR 2, 120 Hz)

The 6-second scripted path runs overview, then 100% zoom, then a pan, then overview again.

| Nodes  | gpu avg fps | gpu p95 | dom avg fps | dom p95  | mount gpu / dom |
| ------ | ----------- | ------- | ----------- | -------- | --------------- |
| 1,000  | 120         | 10.1 ms | 120         | 10.1 ms  | 1 s / 1 s       |
| 10,000 | 98          | 16.7 ms | 85          | 17.0 ms  | 1 s / 1.3 s     |
| 50,000 | 64          | 33.4 ms | 7           | 189.3 ms | 7 s / 13 s      |

- At 50,000 nodes the overview shows placeholders: nodes under 6 screen pixels wide are not
  rasterized.
- At 10,000 nodes the overview takes about 6 s to fill.

## Chrome 157 findings (differ from the WICG explainer)

- **Hit-test registration.** A drawable is hit-tested only after
  `canvas.updateElementGeometry(el, {})` registers it. The `canvasTransform` option does not
  move the hit area.
- **Hit-test position.** The hit area is the element's CSS box, so position it with
  `el.style.transform = canvas.getElementTransform(el, drawMatrix)`. The draw matrix maps the
  element's default-size snapshot (CSS px × DPR) to canvas pixels.
- **Transform changes.** Changing a drawable's CSS transform or pointer-events reports it in
  `changedElements`.
- **Newly drawable elements.** An element that just became drawable is not reported in
  `changedElements`. Its snapshot is available from the next paint event.
- **Per-call cost.** Each `drawElementImageToTexture` call allocates and fully rasterizes, about
  250 to 550 calls per second in total. This, not compositing, limits the fill rate.
- **Drawable count.** Recording cost scales with the number of drawables (and non-`display:none`
  canvas children) on every `requestPaint`. 10,000 always-drawable nodes run at 22 fps even when
  idle.

## Next

- **Keyboard and accessibility.** Parked nodes are `display: none`, so Tab skips them. Needs a
  focus model, such as a mirror or pinning the focused node.
- **Workers.** Composite in a worker with `captureElementImage`, and drive culling from the GPU.
