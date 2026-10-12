import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoomState } from '../src/zoom.js';
import { videoPoint } from '../src/tracker.js';

test('pinch zoom preserves the source point underneath its anchor', () => {
  const zoom = new ZoomState();
  zoom.zoom(3, -120, 50, 640, 360);
  assert.equal(-120 * zoom.scale + zoom.x, -120);
  assert.equal(50 * zoom.scale + zoom.y, 50);
  zoom.zoom(2, -120, 50, 640, 360);
  assert.equal(-120 * zoom.scale + zoom.x, -120);
  assert.equal(50 * zoom.scale + zoom.y, 50);
});
test('zoom/pan limits and reset do not strand the image outside the viewport', () => {
  const zoom = new ZoomState();
  zoom.zoom(100, 0, 0, 400, 300); assert.equal(zoom.scale, 6);
  zoom.x = 10000; zoom.y = -10000; zoom.clamp(400, 300);
  assert.equal(zoom.x, 1000); assert.equal(zoom.y, -750);
  zoom.zoom(.1, 0, 0, 400, 300); assert.equal(zoom.scale, 1); assert.equal(zoom.x, 0);
  zoom.reset(); assert.deepEqual({ scale: zoom.scale, x: zoom.x, y: zoom.y }, { scale: 1, x: 0, y: 0 });
});
test('zoomed and panned selection maps to original source pixels with letterboxing', () => {
  // A 400x400 viewport with a 2x canvas translated +60,-40.
  const transformed = { left: -130, top: -220, width: 800, height: 800 };
  assert.deepEqual(videoPoint(270, 180, transformed, 640, 360), { x: 320, y: 180 });
  assert.equal(videoPoint(270, -210, transformed, 640, 360), null);
});
