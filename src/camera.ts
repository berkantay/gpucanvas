export interface Camera {
  /** World coordinate shown at the viewport's top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A point in surface pixels (from the surface's top left) as world units. */
export const screenToWorld = (camera: Camera, point: Point): Point => ({
  x: camera.x + point.x / camera.zoom,
  y: camera.y + point.y / camera.zoom,
});

/** A world point as surface pixels. */
export const worldToScreen = (camera: Camera, point: Point): Point => ({
  x: (point.x - camera.x) * camera.zoom,
  y: (point.y - camera.y) * camera.zoom,
});

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 16;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zooms by `factor` while keeping the world point under (screenX, screenY) fixed. */
export function zoomAt(camera: Camera, screenX: number, screenY: number, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const worldX = camera.x + screenX / camera.zoom;
  const worldY = camera.y + screenY / camera.zoom;
  return { x: worldX - screenX / zoom, y: worldY - screenY / zoom, zoom };
}

export function visibleWorldRect(
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: viewportWidth / camera.zoom,
    height: viewportHeight / camera.zoom,
  };
}

export const containsPoint = (rect: Rect, point: Point) =>
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height;

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Fits `bounds` into the viewport with `padding` CSS pixels on each side. */
export function fitCamera(
  bounds: Rect,
  viewportWidth: number,
  viewportHeight: number,
  padding = 40,
): Camera {
  const zoom = clampZoom(
    Math.min(
      (viewportWidth - padding * 2) / Math.max(1, bounds.width),
      (viewportHeight - padding * 2) / Math.max(1, bounds.height),
    ),
  );
  return {
    x: bounds.x + bounds.width / 2 - viewportWidth / 2 / zoom,
    y: bounds.y + bounds.height / 2 - viewportHeight / 2 / zoom,
    zoom,
  };
}

/**
 * Wheel and drag input: trackpad scroll pans, pinch or ctrl/cmd + wheel zooms, dragging empty
 * space pans. Calls `onChange` with the next camera; the caller owns the camera value.
 */
export function bindCameraInput(
  element: HTMLElement,
  getCamera: () => Camera,
  onChange: (camera: Camera) => void,
): () => void {
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = element.getBoundingClientRect();
    const camera = getCamera();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.01));
      onChange(zoomAt(camera, event.clientX - bounds.left, event.clientY - bounds.top, factor));
    } else {
      onChange({
        ...camera,
        x: camera.x + event.deltaX / camera.zoom,
        y: camera.y + event.deltaY / camera.zoom,
      });
    }
  };

  let drag: { pointerId: number; x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    // Only drags that start on the canvas background pan; nodes keep their own pointer events.
    // Shift-drags are left to the app, for a selection box.
    if ((event.button !== 0 && event.button !== 1) || event.shiftKey) return;
    if (
      event.target !== element &&
      !(event.target as Element).hasAttribute?.('data-gpucanvas-surface')
    )
      return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const camera = getCamera();
    onChange({
      ...camera,
      x: camera.x - (event.clientX - drag.x) / camera.zoom,
      y: camera.y - (event.clientY - drag.y) / camera.zoom,
    });
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };

  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  return () => {
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerUp);
  };
}
