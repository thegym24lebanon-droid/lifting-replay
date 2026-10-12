import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { videoFrameTimes } from '../src/frames.js';

const folder = mkdtempSync(join(tmpdir(), 'replay-frames-'));
const cfr = join(folder, '30fps.mp4'), vfr = join(folder, 'variable.mp4'), webm = join(folder, 'frames.webm');
const raw = Buffer.alloc(64 * 36 * 3 * 60);
for (let i = 0; i < 60; i++) raw.fill(20 + i * 3, i * 64 * 36 * 3, (i + 1) * 64 * 36 * 3);
const input = ['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','64x36','-framerate','30','-i','pipe:0'];
execFileSync('ffmpeg', [...input,'-c:v','libx264','-pix_fmt','yuv420p','-crf','10',cfr], {input:raw});
execFileSync('ffmpeg', [...input,'-vf',"setpts='if(lt(N,10),N/(30*TB),(10/30+(N-10)/15)/TB)'",'-fps_mode','vfr','-c:v','libx264','-bf','0','-use_editlist','0','-pix_fmt','yuv420p','-crf','10',vfr], {input:raw.subarray(0,64*36*3*20)});
execFileSync('ffmpeg', [...input,'-c:v','libvpx-vp9','-lossless','1',webm], {input:raw.subarray(0,64*36*3*20)});
for (const file of [cfr,vfr,webm]) {
  let reference=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',file],{encoding:'utf8'})).frames.map(f=>Number(f.best_effort_timestamp_time));
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'}));
  // A zero-duration encoded tail packet at the movie end is not a presented frame.
  reference=reference.filter(time=>time<duration-.00001);
  const indexed=await videoFrameTimes(new Blob([readFileSync(file)]),duration,new AbortController().signal);
  assert.equal(indexed.length,reference.length);
  for(let i=0;i<reference.length;i++)assert.ok(Math.abs(indexed[i]-reference[i])<.00001,`presentation frame ${i}`);
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,permissions:['camera']});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.APP_URL||'http://localhost:5173');
  await page.locator('#galleryFile').setInputFiles(cfr);await page.waitForFunction(()=>document.getElementById('frameInfo').textContent.includes('/ 60'));
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  const pixelFrame=()=>page.evaluate(()=>{const c=document.getElementById('replay');return Math.round((c.getContext('2d').getImageData(32,18,1,1).data[0]-20)/3);});
  const waitFrame=async n=>{await page.waitForFunction(n=>document.getElementById('fsFrameInfo').textContent.startsWith(`Frame ${n+1} /`),n);await page.waitForTimeout(90);assert.equal(await pixelFrame(),n,`actual decoded frame ${n}`);};
  await waitFrame(0);
  for(let i=1;i<=6;i++){await page.locator('#fsNextFrame').click();await waitFrame(i);}
  await page.locator('#fsPrevFrame').click();await waitFrame(5);
  await page.locator('#fsScrub').press('ArrowLeft');await waitFrame(4);
  // Each 3px move advances exactly one frame with fine scrubbing enabled.
  assert.equal(await page.locator('#fsFineScrub').getAttribute('aria-pressed'),'true');
  const cd=await context.newCDPSession(page),r=await page.locator('#fsScrub').boundingBox(),point={x:r.x+r.width/2,y:r.y+r.height/2};
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  for(let step=1;step<=3;step++){await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+3*step,y:point.y}]});await waitFrame(4+step);}
  await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+3,y:point.y}]});await waitFrame(5);
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#fsScrub').press('End');await waitFrame(59);assert.equal(await page.locator('#fsNextFrame').isDisabled(),true);
  await page.locator('#fsScrub').press('Home');await waitFrame(0);assert.equal(await page.locator('#fsPrevFrame').isDisabled(),true);
  await page.locator('#fsFineScrub').click();assert.equal(await page.locator('#fsFineScrub').getAttribute('aria-pressed'),'false');
  const rr=await page.locator('#fsScrub').boundingBox();await page.touchscreen.tap(rr.x+10+(rr.width-20)*.5,rr.y+rr.height/2);await page.waitForTimeout(150);assert.ok(await pixelFrame()>=29&&await pixelFrame()<=31);
  await page.locator('#galleryFile').setInputFiles(vfr);await page.waitForFunction(()=>document.getElementById('fsFrameInfo').textContent.includes('/ 19'));
  await page.locator('#fsScrub').press('Home');await waitFrame(0);
  for(let i=1;i<=12;i++){await page.locator('#fsNextFrame').click();await waitFrame(i);}
  await page.locator('#fsPrevFrame').click();await waitFrame(11);
  assert.ok(Math.abs(Number(await page.locator('#fsScrub').inputValue())-.4)<.001,'variable-rate actual timestamp');
  await page.locator('#galleryFile').setInputFiles(webm);await page.waitForFunction(()=>document.getElementById('storage').textContent.includes('frames.webm'));
  await page.locator('#fsNextFrame').click();await waitFrame(1);
  // Whole-picture TV mode uses the complete viewport, with no cover cropping.
  await page.locator('#zoomIn').click();await page.locator('#tvView').click();
  assert.ok((await page.locator('#viewer').getAttribute('class')).includes('tv-mode'));
  assert.equal(await page.locator('#replayViewport').getAttribute('data-zoom'),'1.00');
  const rect=await page.locator('#viewer').boundingBox();assert.equal(rect.width,844);assert.equal(rect.height,390);
  assert.equal(await page.locator('#replay').evaluate(c=>getComputedStyle(c).objectFit),'contain');
  await page.locator('#hideTVControls').click();assert.equal(await page.locator('#fullscreen').isVisible(),false);assert.equal(await page.locator('#showTVControls').isVisible(),true);
  await page.screenshot({path:'/tmp/replay-tv-whole-video.png'});
  await page.locator('#showTVControls').click();assert.equal(await page.locator('#fsScrub').isVisible(),true);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  const portraitRect=await page.locator('#viewer').boundingBox();assert.equal(portraitRect.width,390);assert.equal(portraitRect.height,844);
  const controls=await page.locator('.fullscreen-transport').boundingBox();assert.ok(controls.x>=0&&controls.x+controls.width<=390&&controls.y+controls.height<=844);
  for(const width of [320,360]) {
    await page.setViewportSize({width,height:740});await page.waitForTimeout(50);
    for(const id of ['tvView','fullscreen','hideTVControls','fsPrevFrame','fsNextFrame','fsFineScrub']) {
      const r=await page.locator(`#${id}`).boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width,`${id} fits a ${width}px phone`);
    }
  }
  await page.setViewportSize({width:844,height:390});
  await page.locator('#galleryFile').setInputFiles(cfr);await page.waitForFunction(()=>document.getElementById('frameInfo').textContent.includes('/ 60'));
  await page.locator('#fsSpeed').selectOption('0.25');await page.locator('#fsPause').click();
  await page.waitForFunction(()=>document.getElementById('viewer').classList.contains('tv-controls-hidden'),{},{timeout:6000});
  await page.waitForFunction(()=>!document.getElementById('viewer').classList.contains('tv-controls-hidden'),{},{timeout:6000});
  assert.equal(await page.locator('#fsPause').textContent(),'Play','controls return at the end of playback');
  await page.locator('#tvView').click();assert.ok(!(await page.locator('#viewer').getAttribute('class')).includes('tv-mode'));
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  // Camera footage steps through actual stored captures with irregular timing.
  await page.locator('#start').click();await page.waitForTimeout(700);await page.locator('#stop').click();
  await page.locator('#scrub').press('Home');await page.waitForTimeout(80);const first=Number(await page.locator('#scrub').inputValue());
  await page.locator('#nextFrame').click();await page.waitForFunction(()=>document.getElementById('frameInfo').textContent.startsWith('Frame 2 /'));
  assert.ok(Number(await page.locator('#scrub').inputValue())>first);
  await page.locator('#prevFrame').click();await page.waitForTimeout(80);assert.ok(Math.abs(Number(await page.locator('#scrub').inputValue())-first)<.00001);
  assert.deepEqual(errors,[]);
  // The TV layout and camera controls also work without the Fullscreen API.
  const fallback=await context.newPage();
  await fallback.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('Unavailable');};});
  await fallback.goto(process.env.APP_URL||'http://localhost:5173');await fallback.locator('#captureMode').selectOption('record');
  await fallback.locator('#tvView').click();assert.equal(await fallback.locator('#screenStart').isVisible(),true);
  await fallback.locator('#screenStart').click();await fallback.waitForFunction(()=>document.getElementById('badge').textContent==='RECORDING');
  await fallback.locator('#hideTVControls').click();assert.equal(await fallback.locator('#camera').isVisible(),true,'hiding controls keeps the live camera picture');
  await fallback.locator('#showTVControls').click();await fallback.locator('#screenStop').click();await fallback.locator('#tvView').click();
  assert.equal(await fallback.evaluate(()=>document.body.classList.contains('tv-view-open')),false);
  console.log('PASS: MP4 B-frame, variable-rate MP4 and WebM timestamps match ffprobe; real decoded pixels advance one frame per button/keyboard/small touch move in both directions; boundaries; overview; camera capture frame steps; TV whole-picture fit and hide/show controls; no browser exceptions.');
}finally{await browser.close();rmSync(folder,{recursive:true,force:true});}
