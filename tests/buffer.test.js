import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayBuffer, delayedTime } from '../src/buffer.js';
test('delay selects historical frames, with boundaries',()=>{const b=new ReplayBuffer();for(let i=0;i<=40;i++)b.add(i,new Blob(['a']));assert.equal(b.at(delayedTime(40,5,b.first)).time,35);assert.equal(b.at(delayedTime(40,30,b.first)).time,10);assert.equal(b.at(-5).time,0);assert.equal(b.at(999).time,40);assert.equal(b.at(10.5).time,10);});
test('retention and memory are bounded and clear releases frames',()=>{const b=new ReplayBuffer(30,5);for(let i=0;i<100;i++)b.add(i,new Blob(['aa']));assert.equal(b.frames.length,2);assert.equal(b.bytes,4);assert.equal(b.first,98);b.clear();assert.equal(b.at(0),null);assert.equal(b.bytes,0);});
test('time limit prunes older footage',()=>{const b=new ReplayBuffer(30);b.add(1,new Blob(['a']));b.add(20,new Blob(['a']));b.add(32,new Blob(['a']));assert.equal(b.first,20);});
