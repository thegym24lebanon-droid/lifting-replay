import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'replay-zoom-')),file=join(folder,'lift.mp4');
const raw=Buffer.alloc(480*270*3*60,32);
for(let i=0;i<60;i++){
  const x=100+Math.round(i),y=170-Math.round(40*Math.sin(i/15*.8));
  for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++){
    const value=70+((dx*dx*11+dy*dy*7+dx*dy*19+1000)%180),offset=(i*480*270+(y+dy)*480+x+dx)*3;
    raw.fill(value,offset,offset+3);
  }
}
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','480x270','-framerate','15','-i','pipe:0','-c:v','libx264','-pix_fmt','yuv420p','-crf','16',file],{input:raw});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.APP_URL||'http://localhost:5173');
  await page.locator('#galleryFile').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('badge').textContent==='GALLERY VIDEO');
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.locator('#trackBar').click();
  const sourcePoint=async(x,y)=>page.evaluate(({x,y})=>{const c=document.getElementById('replay'),r=c.getBoundingClientRect(),s=Math.min(r.width/c.width,r.height/c.height);return {x:r.left+(r.width-c.width*s)/2+x*s,y:r.top+(r.height-c.height*s)/2+y*s};},{x,y});
  const cd=await context.newCDPSession(page);
  const center=await sourcePoint(100,170);
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:center.x-40,y:center.y},{id:2,x:center.x+40,y:center.y}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:center.x-120,y:center.y},{id:2,x:center.x+120,y:center.y}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(100);
  assert.ok(Number(await page.locator('#replayViewport').getAttribute('data-zoom'))>2.8,'real two-finger pinch enlarges replay');
  assert.equal(await page.locator('#trackBar').textContent(),'Track bar','pinch never selects a tracking point');
  const exact=await sourcePoint(100,170);
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,x:exact.x+15,y:exact.y+12}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:3,x:exact.x,y:exact.y}]});
  await page.waitForTimeout(80);
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.getElementById('trackBar').textContent==='Reselect bar');
  const yellow=()=>page.evaluate(()=>{const c=document.getElementById('replay'),a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0,minX=Infinity,maxX=0,minY=Infinity,maxY=0;for(let i=0;i<a.length;i+=4)if(a[i]>230&&a[i+1]>180&&a[i+2]<150){const x=(i/4)%c.width,y=Math.floor(i/4/c.width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return {count,x:(minX+maxX)/2,y:(minY+maxY)/2};});
  await page.waitForTimeout(120);let dot=await yellow();assert.ok(dot.count>30);assert.ok(Math.abs(dot.x-100)<2&&Math.abs(dot.y-170)<2,'zoomed adjusted dot is placed on exact source target');
  const rect=await page.locator('#replayViewport').boundingBox(),panX=rect.x+rect.width*.6,panY=rect.y+rect.height*.45;
  const before=await page.locator('#replay').evaluate(c=>c.style.transform);
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:4,x:panX,y:panY}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:4,x:panX+35,y:panY-15}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await page.locator('#replay').evaluate(c=>c.style.transform),before,'single finger pans zoomed replay');
  dot=await yellow();assert.ok(Math.abs(dot.x-100)<2,'panning does not alter tracked source coordinates');
  await page.locator('#zoomReset').click();assert.equal(await page.locator('#replayViewport').getAttribute('data-zoom'),'1.00');
  await page.locator('#zoomIn').click();assert.ok(Number(await page.locator('#replayViewport').getAttribute('data-zoom'))>1);
  await page.locator('#fsPause').click();await page.waitForTimeout(1800);await page.locator('#fsPause').click();
  assert.ok((await yellow()).count>30,'dot stays visible during ordinary tracked playback');
  assert.ok(!(await page.locator('#trackStatus').textContent()).includes('Tracking lost'));
  await page.screenshot({path:'/tmp/replay-zoom-tracking.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  assert.ok((await yellow()).count>30);assert.ok(Number(await page.locator('#replayViewport').getAttribute('data-zoom'))>1);
  await page.locator('#zoomReset').click();await page.locator('#clearTrack').click();
  await page.locator('#fsScrub').press('Home');await page.waitForTimeout(100);
  // Simulate a slower phone decoder to reproduce the old disappearing-dot bug.
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/gallery.js')).name;const {GalleryClip}=await import(url);const read=GalleryClip.prototype.read;GalleryClip.prototype.sampleSink=async()=>null;GalleryClip.prototype.read=async function(...args){await new Promise(r=>setTimeout(r,220));return read.apply(this,args);};});
  await page.locator('#trackBar').click();const slowPoint=await sourcePoint(100,170);await page.touchscreen.tap(slowPoint.x,slowPoint.y);
  await page.waitForFunction(()=>document.getElementById('trackBar').textContent==='Reselect bar');
  await page.locator('#fsPause').click();
  await page.waitForFunction(()=>document.getElementById('trackStatus').textContent.includes('holding the last confirmed dot'),{},{timeout:10000});
  assert.ok((await yellow()).count>30,'confirmed dot remains visible while decoder catches up');
  assert.equal(await page.locator('#fsPause').textContent(),'Pause','playback intent survives a temporary tracking hold');
  await page.locator('#fsPause').click();await page.waitForFunction(()=>document.getElementById('fsPause').textContent==='Play');
  const stopped=Number(await page.locator('#fsScrub').inputValue());await page.waitForTimeout(1700);assert.ok(Math.abs(Number(await page.locator('#fsScrub').inputValue())-stopped)<.02,'manual pause cancels automatic resume');
  await page.locator('#fsPause').click();await page.waitForFunction(stopped=>Number(document.getElementById('fsScrub').value)>stopped+.05,stopped,{timeout:12000});
  assert.ok((await yellow()).count>30);assert.deepEqual(errors,[]);
  console.log('PASS: real pinch/pan; no accidental pinch selection; drag-adjusted dot at source target; reset/button zoom; marker/source coordinates preserved across zoom and orientation; tracked playback; slow-decoder marker stays visible; manual pause cancels hold resume; no browser exceptions.');
} finally {await browser.close();rmSync(folder,{recursive:true,force:true});}
