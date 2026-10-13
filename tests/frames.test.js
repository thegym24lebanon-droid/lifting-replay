import test from 'node:test';
import assert from 'node:assert/strict';
import { frameIndex, snapFrame, adjacentFrame, FrameJog } from '../src/frames.js';

test('variable-rate timestamps step to actual adjacent frames in both directions', () => {
  const times = [0, .016, .033, .071, .109, .175];
  assert.equal(adjacentFrame(times, .05, 1), .071);
  assert.equal(adjacentFrame(times, .05, -1), .016);
  assert.equal(adjacentFrame(times, .0711, 1), .109);
  assert.equal(adjacentFrame(times, .0711, -1), .033);
  assert.equal(adjacentFrame(times, 0, -1), 0);
  assert.equal(adjacentFrame(times, 100, 1), .175);
});
test('fine jog reverses immediately after overshooting either boundary',()=>{
  const jog=new FrameJog(3,10,100,200);
  assert.equal(jog.move(0,200),0);
  assert.equal(jog.move(3,200),1);
  assert.equal(jog.move(203,200),9);
  assert.equal(jog.move(200,200),8);
});
test('tiny finger moves accumulate and pulling down slows without jumping',()=>{
  const jog=new FrameJog(10,30,100,200);
  assert.equal(jog.move(101,200),10);assert.equal(jog.move(102,200),10);assert.equal(jog.move(103,200),11);
  assert.equal(jog.move(103,300),11);
  assert.equal(jog.move(109,300),11);assert.equal(jog.move(112,300),12);
});
test('scrubbing snaps to recorded timestamps rather than a fixed frame interval', () => {
  const times = [.004, .075, .134, .211];
  assert.equal(snapFrame(times, .1), .075);
  assert.equal(snapFrame(times, .12), .134);
  assert.equal(snapFrame(times, -1), .004);
  assert.equal(snapFrame(times, 10), .211);
  assert.equal(frameIndex(times, .14), 2);
  assert.equal(frameIndex([], .14), -1);
  assert.equal(snapFrame([], .14), .14);
});
