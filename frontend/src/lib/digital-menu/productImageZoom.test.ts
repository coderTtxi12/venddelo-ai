import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampImageZoomTransform,
  toggleDoubleTapZoom,
  zoomAtPoint,
  IMAGE_LIGHTBOX_DOUBLE_TAP_SCALE,
  IMAGE_ZOOM_RESET,
} from './productImageZoom.ts';

test('clampImageZoomTransform resets pan at 1x', () => {
  const result = clampImageZoomTransform(
    { scale: 1, x: 120, y: -80 },
    400,
    800,
    1200,
    900,
  );
  assert.deepEqual(result, { scale: 1, x: 0, y: 0 });
});

test('clampImageZoomTransform limits pan when zoomed in', () => {
  const result = clampImageZoomTransform(
    { scale: 3, x: 9999, y: -9999 },
    400,
    400,
    800,
    800,
  );
  assert.ok(result.x < 9999);
  assert.ok(result.y > -9999);
  assert.equal(result.scale, 3);
});

test('toggleDoubleTapZoom zooms in then resets', () => {
  const zoomed = toggleDoubleTapZoom(IMAGE_ZOOM_RESET, 0, 0);
  assert.equal(zoomed.scale, IMAGE_LIGHTBOX_DOUBLE_TAP_SCALE);

  const reset = toggleDoubleTapZoom(zoomed, 0, 0);
  assert.deepEqual(reset, IMAGE_ZOOM_RESET);
});

test('zoomAtPoint keeps the focal point stable', () => {
  const start = { scale: 1, x: 0, y: 0 };
  const next = zoomAtPoint(start, 2, 50, -25);
  assert.equal(next.scale, 2);
  assert.notEqual(next.x, 0);
  assert.notEqual(next.y, 0);
});
