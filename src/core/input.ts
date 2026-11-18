import { zoomAt, type Camera } from './camera';
import type { Point } from './rect';

/** Marks the surface and the elements under it that count as empty canvas, where drags pan. */
export const markSurface = (element: HTMLElement) => {
  element.dataset.gpucanvasSurface = '';
};
const isSurface = (target: EventTarget | null) =>
  target instanceof Element && target.hasAttribute('data-gpucanvas-surface');

/** Where a pointer event lands on `element`, in its CSS pixels from the top left. */
export const pointIn = (element: Element, event: { clientX: number; clientY: number }): Point => {
  const bounds = element.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
};

/**
 * Wheel, drag and touch input: trackpad scroll pans, pinch or ctrl/cmd + wheel zooms, dragging
 * empty space pans, and a two-finger touch pinch zooms and pans, wherever the fingers land. Calls
 * `onChange` with the next camera; the caller owns the camera value.
 */
export function bindCameraInput(
  element: HTMLElement,
  getCamera: () => Camera,
  onChange: (camera: Camera) => void,
): () => void {
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const camera = getCamera();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.01));
      const at = pointIn(element, event);
      onChange(zoomAt(camera, at.x, at.y, factor));
    } else {
      onChange({
        ...camera,
        x: camera.x + event.deltaX / camera.zoom,
        y: camera.y + event.deltaY / camera.zoom,
      });
    }
  };

  let drag: { pointerId: number; x: number; y: number } | null = null;
  /** Fingers down on the canvas, nodes included, so a pinch can start on one. */
  const touches = new Map<number, { x: number; y: number }>();
  const pinch = () => {
    const [a, b] = [...touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        drag = null;
        for (const id of touches.keys()) {
          try {
            element.setPointerCapture(id);
          } catch {
            // The finger already lifted; pointerup removes it.
          }
        }
        return;
      }
    }
    // Only drags that start on the canvas background pan; nodes keep their own pointer events.
    // Shift-drags are left to the app, for a selection box.
    if ((event.button !== 0 && event.button !== 1) || event.shiftKey) return;
    if (!isSurface(event.target)) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const touch = touches.get(event.pointerId);
    if (touch && touches.size === 2) {
      const before = pinch();
      touch.x = event.clientX;
      touch.y = event.clientY;
      const after = pinch();
      if (!before.distance) return;
      const at = pointIn(element, { clientX: before.x, clientY: before.y });
      const zoomed = zoomAt(getCamera(), at.x, at.y, after.distance / before.distance);
      onChange({
        ...zoomed,
        x: zoomed.x - (after.x - before.x) / zoomed.zoom,
        y: zoomed.y - (after.y - before.y) / zoomed.zoom,
      });
      return;
    }
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
    }
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
    touches.delete(event.pointerId);
    if (drag?.pointerId === event.pointerId) drag = null;
    // One finger lifted out of a pinch: the other keeps panning instead of going dead until it
    // lifts too.
    if (touches.size === 1) {
      const [[pointerId, point]] = touches;
      drag = { pointerId, x: point.x, y: point.y };
    }
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
