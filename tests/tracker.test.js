import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchTracker,BarPath,videoPoint} from '../src/tracker.js';
const W=160,H=110;
function scene(x,y,{occluded=false,distractor=false,twin=false}={}) {
 const data=new Uint8Array(W*H).fill(30);
 const patch=(cx,cy,similar)=>{for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++)if(cx+dx>=0&&cy+dy>=0&&cx+dx<W&&cy+dy<H)data[(cy+dy)*W+cx+dx]=similar ? 70+((dx*dx*11+dy*dy*7+dx*dy*19+1000)%180) : ((dx+dy)%2?230:50);};
 if(!occluded)patch(x,y,true);if(distractor)patch(x+18,y+10,twin);
 return {data,width:W,height:H};
}
test('local matching follows a known reversing trajectory with distractors',()=>{
 const track=new PatchTracker(scene(40,50),40,50);
 for(let i=1;i<30;i++) {const x=40+Math.round(18*Math.sin(i/7)),y=50-Math.round(i/2);const p=track.step(scene(x,y,{distractor:true}));assert.ok(p);assert.ok(Math.abs(p.x-x)<=1&&Math.abs(p.y-y)<=1);}
});
test('gradual texture changes remain tracked using conservative template adaptation',()=>{
 const change=(x,y,mix)=>{
  const image=scene(x,y);
  for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){
   const index=(y+dy)*W+x+dx;
   const alternate=50+((dx*dx*31+dy*dy*47+dx*dy*5+3000)%190);
   image.data[index]=Math.round(image.data[index]*(1-mix)+alternate*mix);
  }
  return image;
 };
 const tracker=new PatchTracker(change(40,60,0),40,60);
 for(let i=1;i<=40;i++){
  const x=40+Math.floor(i/2),y=60-Math.floor(i/3);
  const p=tracker.step(change(x,y,i/40));
  assert.ok(p,`appearance change at ${i}`);assert.ok(Math.abs(p.x-x)<=1&&Math.abs(p.y-y)<=1);
 }
});
test('diagonal movement inside the search window is not spuriously rejected',()=>{
 const tracker=new PatchTracker(scene(40,40),40,40);
 const p=tracker.step(scene(60,60));assert.ok(p);assert.equal(p.x,60);assert.equal(p.y,60);
});
test('precise fractional dot placement is retained while the patch moves',async()=>{
 const a={time:0,image:scene(40,50)},b={time:.1,image:scene(43,48)};
 const path=new BarPath(async f=>f.image);
 await path.select(a,40.35/W,50.45/H);
 assert.equal(path.points[0].x,40.35/W);assert.equal(path.points[0].y,50.45/H);
 await path.through([a,b],.1);
 assert.ok(Math.abs(path.points.at(-1).x*W-43.35)<.00001);
 assert.ok(Math.abs(path.points.at(-1).y*H-48.45)<.00001);
});
test('a smooth bar end uses its outline without displacing the selected center',()=>{
 const circle=(x,y)=>{
  const data=new Uint8Array(W*H).fill(30);
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx+dy*dy<=144)data[(y+dy)*W+x+dx]=200;
  return {width:W,height:H,data};
 };
 const tracker=new PatchTracker(circle(40,50),40,50);
 assert.ok(tracker.radius>7);const point=tracker.step(circle(44,47));
 assert.ok(point);assert.equal(point.x,44);assert.equal(point.y,47);
});
test('fine detail between sparse sample positions is not discarded',()=>{
 const cross=(x,y)=>{const data=new Uint8Array(W*H).fill(30);for(let d=-6;d<=6;d++){data[y*W+x+d]=230;data[(y+d)*W+x]=230;}return {width:W,height:H,data};};
 const tracker=new PatchTracker(cross(40,50),40,50),point=tracker.step(cross(44,47));
 assert.ok(point);assert.equal(point.x,44);assert.equal(point.y,47);
});
test('occlusion, ambiguous twins, low detail and large jumps are rejected',()=>{
 assert.equal(new PatchTracker(scene(40,50),40,50).step(scene(40,50,{occluded:true,distractor:true})),null);
 assert.equal(new PatchTracker(scene(40,50),40,50).step(scene(40,50,{distractor:true,twin:true})),null);
 assert.equal(new PatchTracker(scene(40,50),40,50).step(scene(100,50)),null);
 assert.throws(()=>new PatchTracker({width:W,height:H,data:new Uint8Array(W*H)},40,50),/detail/);
});
test('the surrounding bar-end outline survives motion blur and returns to sharp detail',()=>{
 const plate=(x,y,blur=0)=>{
  const data=new Uint8Array(W*H).fill(30);
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx+dy*dy<=144)data[(y+dy)*W+x+dx]=130+((dx*dx*11+dy*dy*7+dx*dy*19+1000)%120);
  if(blur){const original=data.slice();for(let yy=blur;yy<H-blur;yy++)for(let xx=0;xx<W;xx++){let sum=0;for(let d=-blur;d<=blur;d++)sum+=original[(yy+d)*W+xx];data[yy*W+xx]=Math.round(sum/(blur*2+1));}}
  return {width:W,height:H,data};
 };
 const tracker=new PatchTracker(plate(40,60),40,60);
 for(let i=1;i<=12;i++) {
  const x=40+i*2,y=60-i,point=tracker.step(plate(x,y,i<=8?Math.min(3,Math.ceil(i/3)):0));
  assert.ok(point,`blurred frame ${i}`);assert.ok(Math.abs(point.x-x)<=1 && Math.abs(point.y-y)<=1);
 }
});
test('forward seeks visit every frame; backward seeks retain the full computed path; reselect starts a new segment',async()=>{
 const frames=Array.from({length:12},(_,i)=>({time:i/15,image:scene(40+i,50-i)}));const visited=[];
 const path=new BarPath(async f=>{visited.push(f.time);return f.image;});
 await path.select(frames[0],40/W,50/H);await path.through(frames,frames.at(-1).time);
 assert.equal(path.points.length,12);assert.deepEqual(visited,frames.map(f=>f.time));
 await path.through(frames,.2);assert.equal(path.points.length,12);assert.equal(path.visible(.2).length,4);
 await path.select(frames[4],44/W,46/H);assert.equal(path.points.length,5);assert.notEqual(path.points[3].segment,path.points[4].segment);
 await path.through(frames,frames.at(-1).time);assert.equal(path.points.length,12);
 path.clear();assert.equal(path.points.length,0);
});
test('loss does not bridge occlusion, and reselect can resume',async()=>{
 const frames=Array.from({length:8},(_,i)=>({time:i/15,image:scene(40+i,50,{occluded:i===3})}));const path=new BarPath(async f=>f.image);
 await path.select(frames[0],40/W,50/H);await path.through(frames,1);assert.equal(path.lostAt,.2);assert.equal(path.points.length,3);
 await path.select(frames[4],44/W,50/H);await path.through(frames,1);assert.equal(path.lostAt,null);assert.equal(path.points.length,7);
 const gap=new BarPath(async f=>f.image);await gap.select(frames[0],40/W,50/H);await gap.through([frames[0],{...frames[7],time:2}],2);assert.equal(gap.lostAt,2);assert.equal(gap.points.length,1);
});
test('letterboxing and fullscreen coordinate transforms reject black bars',()=>{
 const portrait={left:10,top:20,width:300,height:600};assert.equal(videoPoint(160,25,portrait,960,540),null);
 assert.deepEqual(videoPoint(160,320,portrait,960,540),{x:480,y:270});
 const landscape={left:0,top:0,width:900,height:400};assert.deepEqual(videoPoint(450,200,landscape,960,540),{x:480,y:270});
});
test('a cancelled asynchronous seek cannot add stale tracking results',async()=>{
 let release;let delayed=false;
 const path=new BarPath(async f=>{if(delayed)await new Promise(r=>release=r);return f.image;});
 const a={time:0,image:scene(40,50)},b={time:.1,image:scene(42,50)};
 await path.select(a,40/W,50/H);delayed=true;
 const work=path.through([a,b],.1);while(!release)await new Promise(r=>setTimeout(r,0));path.clear();release();await work;
 assert.equal(path.points.length,0);assert.equal(path.tracker,null);
});
