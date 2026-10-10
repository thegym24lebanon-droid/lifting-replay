import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayBuffer, delayedTime } from '../src/buffer.js';
test('delay selects historical frames, with boundaries',()=>{const b=new ReplayBuffer();for(let i=0;i<=40;i++)b.add(i,new Blob(['a']));assert.equal(b.at(delayedTime(40,5,b.first)).time,35);assert.equal(b.at(delayedTime(40,30,b.first)).time,10);assert.equal(b.at(-5).time,0);assert.equal(b.at(999).time,40);assert.equal(b.at(10.5).time,10);});
test('retention and memory are bounded and clear releases frames',()=>{const b=new ReplayBuffer(30,5);for(let i=0;i<100;i++)b.add(i,new Blob(['aa']));assert.equal(b.frames.length,2);assert.equal(b.bytes,4);assert.ok(b.first>=69);assert.equal(b.last,99);b.clear();assert.equal(b.at(0),null);assert.equal(b.bytes,0);});
test('time limit prunes older footage',()=>{const b=new ReplayBuffer(30);b.add(1,new Blob(['a']));b.add(20,new Blob(['a']));b.add(32,new Blob(['a']));assert.equal(b.first,20);});
test('record mode preserves the beginning and rejects new frames at the byte limit', () => {
  const b = new ReplayBuffer(Infinity, 10); b.retainAll = true;
  assert.equal(b.add(0, new Blob(['12345'])),true);
  assert.equal(b.add(1000, new Blob(['12345'])),true);
  assert.equal(b.add(2000, new Blob(['x'])),false);
  assert.equal(b.first,0); assert.equal(b.last,1000); assert.equal(b.bytes,10);
  b.clear(); assert.equal(b.add(0,new Blob(['x'])),true);
});
test('both selected delay bounds map to historical footage through rolling retention', () => {
  const b = new ReplayBuffer(90, 10000);
  for(let i=0;i<=240;i++) b.add(i,new Blob(['x']));
  for(const delay of [5,30]) assert.equal(b.at(delayedTime(240,delay,b.first)).time,240-delay);
  assert.equal(b.first,150); assert.equal(b.frames.length,91);
});

test('rolling byte pressure thins frames indefinitely while preserving delay coverage', () => {
  const b = new ReplayBuffer(90,4500);
  for(let i=0;i<=15*600;i++) {
    const time=i/15; assert.equal(b.add(time,new Blob(['0123456789'])),true);
    assert.ok(b.bytes<=4500);
    if(time>90) for(const delay of [5,30]) {
      const selected=b.at(time-delay).time;
      assert.ok(selected<=time-delay && time-delay-selected<0.6);
    }
  }
  assert.ok(b.thinned); assert.equal(b.last,600); assert.ok(b.last-b.first>89);
  assert.equal(b.add(601,new Blob(['x'.repeat(4501)])),true);
  assert.ok(b.bytes<=4500); assert.equal(b.last,600);
});
