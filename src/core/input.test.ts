import { describe, expect, test } from 'bun:test';
import { bindCameraInput } from './input';
import type { Camera } from './camera';

// bun's test runtime has no DOM, and `isSurface` only needs `Element` to exist so that
// `instanceof` doesn't throw; a plain stand-in target is never an instance of it, which is enough
// for every path these tests exercise (none of them start a mouse drag on the canvas surface).
if (typeof (globalThis as Record<string, unknown>).Element === 'undefined') {
  (globalThis as Record<string, unknown>).Element = class {};
}

/** The minimum `bindCameraInput` asks of its `element` argument. */
class FakeElement {
  private listeners = new Map<string, (event: unknown) => void>();
  capturedPointers = new Set<number>();

  addEventListener(type: string, handler: (event: unknown) => void) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type: string) {
    this.listeners.delete(type);
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointers.add(pointerId);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect;
  }

  fire(type: string, event: Record<string, unknown>) {
    this.listeners.get(type)?.(event);
  }
}

const pointerEvent = (overrides: Record<string, unknown>) => ({
  pointerType: 'touch',
  button: 0,
  shiftKey: false,
  target: null,
  ...overrides,
});

const wheelEvent = (overrides: Record<string, unknown>) => ({
  preventDefault() {},
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  clientX: 0,
  clientY: 0,
  ...overrides,
});

function setup(camera: Camera) {
  const element = new FakeElement();
  const changes: Camera[] = [];
  let current = camera;
  bindCameraInput(
    element as unknown as HTMLElement,
    () => current,
    (next) => {
      current = next;
      changes.push(next);
    },
  );
  return { element, changes, camera: () => current };
}

describe('bindCameraInput: wheel', () => {
  test('a plain scroll pans without changing zoom', () => {
    const { element, changes } = setup({ x: 0, y: 0, zoom: 1 });
    element.fire('wheel', wheelEvent({ deltaX: 10, deltaY: 20 }));
    expect(changes).toEqual([{ x: 10, y: 20, zoom: 1 }]);
  });

  test('ctrl+scroll zooms around the pointer instead of panning', () => {
    const { element, changes } = setup({ x: 0, y: 0, zoom: 1 });
    element.fire('wheel', wheelEvent({ ctrlKey: true, deltaY: -100, clientX: 40, clientY: 40 }));
    expect(changes).toHaveLength(1);
    expect(changes[0].zoom).toBeGreaterThan(1);
  });
});

describe('bindCameraInput: two-finger touch', () => {
  test('pinching apart zooms in around the midpoint', () => {
    const { element, changes } = setup({ x: 0, y: 0, zoom: 1 });
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }),
    );
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 }),
    );
    element.fire(
      'pointermove',
      pointerEvent({ pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].zoom).toBeGreaterThan(1);
  });

  test('lifting one finger out of a pinch keeps the other finger panning', () => {
    // Regression test: dropping from two fingers to one used to leave `drag` null forever, so
    // the remaining finger stopped panning until it lifted and touched down again.
    const { element, changes } = setup({ x: 0, y: 0, zoom: 1 });
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }),
    );
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 }),
    );
    element.fire('pointerup', pointerEvent({ pointerId: 2, pointerType: 'touch' }));
    expect(changes).toHaveLength(0); // no pan or zoom from the setup itself

    element.fire(
      'pointermove',
      pointerEvent({ pointerId: 1, pointerType: 'touch', clientX: 130, clientY: 100 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ x: -30, y: 0, zoom: 1 });
  });

  test('lifting the second finger too stops the pan', () => {
    const { element, changes } = setup({ x: 0, y: 0, zoom: 1 });
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }),
    );
    element.fire(
      'pointerdown',
      pointerEvent({ pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 }),
    );
    element.fire('pointerup', pointerEvent({ pointerId: 2, pointerType: 'touch' }));
    element.fire('pointerup', pointerEvent({ pointerId: 1, pointerType: 'touch' }));
    element.fire(
      'pointermove',
      pointerEvent({ pointerId: 1, pointerType: 'touch', clientX: 999, clientY: 999 }),
    );
    expect(changes).toHaveLength(0);
  });
});
