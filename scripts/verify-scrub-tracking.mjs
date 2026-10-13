import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const dir=mkdtempSync(join(tmpdir(),'replay-continuity-')),file=join(dir,'fast-bar.mp4'),W=480,H=270;
const position=i=>({x:150+i*2,y:i<=10?218-i*14:i<=30?78+(i-10)*4:158+(i-30)*2});
const raw=Buffer.alloc(W*H*3*60,30);
for(let i=0;i<60;i++) {
  const {x,y}=position(i),gray=new Uint8Array(W*H).fill(30);
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)if(dx*dx+dy*dy<=144)gray[(y+dy)*W+x+dx]=130+((dx*dx*11+dy*dy*7+dx*dy*19+1000)%120);
  // A few genuinely blurred frames, rather than changing the test threshold.
  if(i>=15&&i<=21) {
    const original=gray.slice();
    for(let yy=2;yy<H-2;yy++)for(let xx=0;xx<W;xx++){let sum=0;for(let d=-2;d<=2;d++)sum+=original[(yy+d)*W+xx];gray[yy*W+xx]=Math.round(sum/5);}
  }
  for(let p=0;p<gray.length;p++)raw.fill(gray[p],(i*W*H+p)*3,(i*W*H+p+1)*3);
}
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','60','-i','pipe:0','-c:v','libx264','-crf','10','-pix_fmt','yuv420p',file],{input:raw});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.APP_URL||'http://localhost:5173');
  // Observe actual native seeks and analyzed timestamps, without replacing any
  // decoding or matching implementation.
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/gallery.js')).name;
    const {GalleryClip}=await import(url),load=GalleryClip.prototype.load;
    GalleryClip.prototype.load=async function(){const result=await load.call(this);window.probe=this;this.video.addEventListener('seeking',()=>{window.seekCount=(window.seekCount||0)+1;});return result;};
    const frames=GalleryClip.prototype.trackingFrames;
    GalleryClip.prototype.trackingFrames=async function*(...args){for await(const frame of frames.apply(this,args)){(window.analyzed||=[]).push(frame.time);yield frame;}};
  });
  await page.locator('#galleryFile').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('frameInfo').textContent.includes('/ 60'));
  await page.locator('#fullscreen').click();await page.locator('#trackBar').click();
  const p=await page.evaluate(()=>{const c=document.getElementById('replay'),r=c.getBoundingClientRect(),s=Math.min(r.width/480,r.height/270);return {x:r.x+(r.width-480*s)/2+150*s,y:r.y+(r.height-270*s)/2+218*s};});
  await page.touchscreen.tap(p.x,p.y);await page.waitForFunction(()=>document.getElementById('trackBar').textContent==='Reselect bar');
  const seek=async i=>page.locator('#fsScrub').evaluate((el,time)=>{el.value=time;el.dispatchEvent(new Event('input',{bubbles:true}));},i/60);
  await page.evaluate(()=>{window.seekCount=0;window.burstStart=performance.now();const e=document.getElementById('fsScrub');for(const frame of [5,15,30,12,45,20,40,8,50]){e.value=frame/60;e.dispatchEvent(new Event('input',{bubbles:true}));}});
  await page.waitForFunction(()=>document.getElementById('fsFrameInfo').textContent.startsWith('Frame 51 /'));
  const yellow=()=>page.evaluate(()=>{const c=document.getElementById('replay'),a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0,minX=Infinity,maxX=0,minY=Infinity,maxY=0;for(let i=0;i<a.length;i+=4)if(a[i]>230&&a[i+1]>180&&a[i+2]<150){const x=i/4%c.width,y=Math.floor(i/4/c.width);n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return {n,x:(minX+maxX)/2,y:(minY+maxY)/2};});
  const expected=position(50);
  await page.waitForFunction(({x,y})=>{const c=document.getElementById('replay'),a=c.getContext('2d').getImageData(x,y,1,1).data;return a[0]>230&&a[1]>180&&a[2]<150;},expected,{timeout:20000});
  assert.ok(!(await page.locator('#trackStatus').textContent()).includes('lost'));
  let dot=await yellow();assert.ok(dot.n>30&&Math.abs(dot.x-expected.x)<=2&&Math.abs(dot.y-expected.y)<=2);
  const stats=await page.evaluate(()=>({seeks:window.seekCount,times:window.analyzed,ms:performance.now()-window.burstStart,stream:!!window.probe.sampleInput}));
  assert.equal(stats.stream,true,'WebCodecs sequential analysis is used');
  for(let i=1;i<=50;i++)assert.ok(stats.times.some(t=>Math.abs(t-i/60)<.00001),`real frame ${i} was analyzed`);
  assert.ok(stats.seeks<=2,`nine requests coalesced instead of ${stats.seeks} native restarts`);
  // Revisiting any already analyzed frame must place the dot immediately at its
  // true location, through rapid forward and backward frame moves.
  for(const i of [4,25,10,40,17,49]) {
    await seek(i);await page.waitForFunction(i=>!window.probe.video.seeking && window.probe.requestedTime===null && Math.abs(window.probe.video.currentTime-i/60)<.001,i);await page.waitForTimeout(35);
    dot=await yellow();const want=position(i);assert.ok(Math.abs(dot.x-want.x)<=2&&Math.abs(dot.y-want.y)<=2,`cached frame ${i} dot stays on the bar end`);
  }
  // Pulling down changes sensitivity, and reversing after an endpoint overshoot
  // moves back immediately rather than making the finger retrace dead space.
  await page.locator('#fsScrub').press('Home');await page.waitForTimeout(100);
  const cd=await context.newCDPSession(page),r=await page.locator('#fsScrub').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-100,y}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-97,y}]});
  await page.waitForFunction(()=>document.getElementById('fsFrameInfo').textContent.startsWith('Frame 2 /'));
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-97,y:y+50}]});
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-94,y:y+50}]});
  await page.waitForTimeout(50);assert.match(await page.locator('#fsFrameInfo').textContent(),/^Frame 2 \//);
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-91,y:y+50}]});
  await page.waitForFunction(()=>document.getElementById('fsFrameInfo').textContent.startsWith('Frame 3 /'));
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(100);assert.match(await page.locator('#fsFrameInfo').textContent(),/^Frame 3 \//,'release keeps the selected frame');
  // A pause must cancel a Play queued behind a video seek.
  await page.evaluate(()=>{const e=document.getElementById('fsScrub');e.value=30/60;e.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('fsPause').click();document.getElementById('fsPause').click();});
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.probe.video.paused && !window.probe.playPending),true);
  // Exercise the same every-frame path through native HTML video decoding when
  // WebCodecs is unavailable, preserving browser codec compatibility.
  await page.locator('#clearTrack').click();await page.locator('#fsScrub').press('Home');await page.waitForTimeout(100);
  await page.evaluate(()=>{window.probe.sinkPromise=Promise.resolve(null);window.probe.sampleInput?.dispose();window.probe.sampleInput=null;});
  await page.locator('#trackBar').click();await page.touchscreen.tap(p.x,p.y);await page.waitForFunction(()=>document.getElementById('trackBar').textContent==='Reselect bar');
  await seek(10);await page.waitForFunction(()=>{const c=document.getElementById('replay'),a=c.getContext('2d').getImageData(170,78,1,1).data;return a[0]>230&&a[1]>180&&a[2]<150;});
  assert.ok(!(await page.locator('#trackStatus').textContent()).includes('lost'));
  assert.deepEqual(errors,[]);
  console.log(`PASS: every 60fps frame tracked through fast motion and blur; nine rapid seeks coalesced into ${stats.seeks}; true bar-end dot on cached forward/backward scrubs; endpoint reversal and pull-down precision; native codec fallback; ${Math.round(stats.ms)}ms to trace 50 frames; no browser exceptions.`);
} finally {await browser.close();rmSync(dir,{recursive:true,force:true});}
