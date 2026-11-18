import { describe, expect, test } from 'bun:test';
import {
  fitCamera,
  rectToScreen,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';

describe('screenToWorld / worldToScreen', () => {
  test('are inverse at zoom 1 with no offset', () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    expect(screenToWorld(camera, { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
    expect(worldToScreen(camera, { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
  });

  test('account for pan and zoom together', () => {
    const camera: Camera = { x: 100, y: 200, zoom: 2 };
    const world = screenToWorld(camera, { x: 20, y: 10 });
    expect(world).toEqual({ x: 110, y: 205 });
    expect(worldToScreen(camera, world)).toEqual({ x: 20, y: 10 });
  });
});

describe('rectToScreen', () => {
  test('scales position and size by zoom', () => {
    const camera: Camera = { x: 10, y: 10, zoom: 2 };
    expect(rectToScreen(camera, { x: 10, y: 10, width: 5, height: 8 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 16,
    });
  });
});

describe('zoomAt', () => {
  test('keeps the world point under the screen anchor fixed', () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld(camera, { x: 40, y: 60 });
    const after = zoomAt(camera, 40, 60, 2);
    expect(after.zoom).toBe(2);
    expect(screenToWorld(after, { x: 40, y: 60 })).toEqual(before);
  });

  test('clamps zoom to the documented range', () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(camera, 0, 0, 1000).zoom).toBe(16);
    expect(zoomAt(camera, 0, 0, 0.0001).zoom).toBe(0.02);
  });
});

describe('fitCamera', () => {
  test('centers the bounds in the viewport with no padding left over', () => {
    const camera = fitCamera({ x: 0, y: 0, width: 100, height: 100 }, 200, 200, 0);
    expect(camera.zoom).toBe(2);
    expect(worldToScreen(camera, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(worldToScreen(camera, { x: 100, y: 100 })).toEqual({ x: 200, y: 200 });
  });

  test('picks the smaller of the two axis scales so content never spills over', () => {
    // Wide content in a square viewport: height is the limiting axis's complement, so the
    // width-based scale (the smaller one) wins and the fit has slack top and bottom.
    const camera = fitCamera({ x: 0, y: 0, width: 400, height: 100 }, 200, 200, 0);
    expect(camera.zoom).toBe(0.5);
  });
});
