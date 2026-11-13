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

1. **Pages.** Nodes are live DOM inside `<canvas content="drawable">`, packed side by side into
   pages of 2048 CSS pixels. Chrome records a page as one snapshot, so one
   `drawElementImageToTexture` call rasterizes dozens of nodes at once.
2. **Rasterize, then park.** A page with nodes waiting for pixels becomes `drawable`. In the next
   paint event it is drawn into a texture-array atlas, whole or one node at a time when only a
   few changed. Then it is parked with `content-visibility: hidden`, which keeps layout but skips
   paint, so the browser spends nothing on it per frame.
3. **Thumbnails first.** Every node gets a 1/16 scale thumbnail in an atlas layer that is never
   evicted, so a zoomed-out view of thousands of screens is always filled in. Sharper snapshots
   go on top at power-of-two scales, so zooming reuses them.
4. **Tiles up close.** Past 100% zoom on a 2x display, only the visible part of a node is
   rasterized, as sharp tiles, center first. While its content animates, one half-resolution preview stands in.
5. **One draw call.** Each frame culls nodes against the view and draws every visible one with
   one instanced quad draw. Panning and zooming never touch the DOM. Raster work has a
   per-frame budget, so the camera stays smooth while pixels fill in.
6. **Live updates.** A MutationObserver marks a node dirty when its content changes, and
   loading images, web fonts and CSS transitions trigger a redraw. Animated content on nodes
   under 200 screen pixels refreshes at most four times a second.
7. **Input.** Only the page under the pointer is registered for hit testing, and a CSS transform
   puts the node under the pointer exactly where the GPU drew it. Clicks, typing, selection and
   hover all go to the real element. A focused node keeps its page live.

## Measured (M-series Mac, Chrome 157, 1600 x 900 window, DPR 1)

The demo's benchmark (press `b`) runs a 94-second session: from the overview into clusters of
app screens, close-ups up to 500% zoom, 20 clicks and typed messages, then back out. Every frame
is timed.

| Screens | gpucanvas avg fps | gpucanvas p95 | DOM avg fps | DOM p95  | Mount gpucanvas / DOM |
| ------- | ----------------- | ------------- | ----------- | -------- | --------------------- |
| 5,000   | 117               | 9.2 ms        | 23          | 50.2 ms  | 1.2 s / 1.3 s         |
| 10,000  | 108               | 16.7 ms       | 9           | 133.8 ms | 1.8 s / 3.4 s         |

DOM is the same screens in one CSS-transformed container, which is also the fallback backend.

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
  250 to 550 calls per second in total. This, not compositing, limits the fill rate, which is
  why nodes are batched into pages.
- **Cropping.** A source rectangle still rasterizes the whole source element at the requested
  scale before cropping. Zoomed in, a node therefore moves to a page of its own.
- **Drawable count.** Recording cost scales with the number of drawables (and non-`display:none`
  canvas children) on every `requestPaint`. 10,000 always-drawable nodes run at 22 fps even when
  idle.

## Next

- **Keyboard and accessibility.** Parked pages use `content-visibility: hidden`, so Tab skips
  their nodes. A focused node already stays live; moving focus across pages needs a focus model.
- **Workers.** Composite in a worker with `captureElementImage`, and drive culling from the GPU.
