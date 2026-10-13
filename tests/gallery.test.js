import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisFrames } from '../src/gallery.js';

test('gallery tracing visits intervening frames and the exact seek target', () => {
  const frames = [...analysisFrames(1, 1.25)];
  assert.equal(frames.length, 4);
  assert.equal(frames.at(-1).time, 1.25);
  assert.ok(frames.every(f => f.gallery));
  let previous = 1;
  for (const frame of frames) { assert.ok(frame.time > previous); assert.ok(frame.time - previous <= 1/15 + 0.00001); previous = frame.time; }
});
test('rewinding or a stationary cursor does not create tracking frames', () => {
  assert.deepEqual([...analysisFrames(4, 2)], []);
  assert.deepEqual([...analysisFrames(4, 4)], []);
});
test('indexed gallery tracking visits every real frame during a large jump',()=>{
  const times=Float64Array.from([0,.016,.033,.05,.071,.087,.104,.13,.15]);
  assert.deepEqual([...analysisFrames(.0001,.13,1/15,times)].map(f=>f.time),Array.from(times).slice(1,8));
  assert.deepEqual([...analysisFrames(.071,.09,1/15,times)].map(f=>f.time),[.087]);
  assert.deepEqual([...analysisFrames(.13,.04,1/15,times)],[]);
});
