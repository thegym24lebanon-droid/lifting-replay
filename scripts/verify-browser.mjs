import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.APP_URL || 'http://localhost:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const errors=[];
const waitText=(p,id,text,timeout=10000)=>p.waitForFunction(({id,text})=>document.getElementById(id).textContent.includes(text),{id,text},{timeout});
const delay=async(p,n)=>{await p.locator('#delay').fill(String(n));await p.locator('#delay').dispatchEvent('input');};
const nonblack=async(p,id)=>p.evaluate(id=>{const el=document.getElementById(id), c=document.createElement('canvas'); c.width=80;c.height=60; c.getContext('2d').drawImage(el,0,0,80,60);const a=c.getContext('2d').getImageData(0,0,80,60).data;return a.some((v,i)=>i%4!==3&&v>40);},id);
try {
 const context=await browser.newContext({viewport:{width:412,height:915},permissions:['camera']});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base); await delay(page,5);await page.reload();assert.equal(await page.locator('#delay').inputValue(),'5');
 await page.locator('#install').click();assert.equal(await page.locator('#installHelp').isVisible(),true);await page.locator('#closeInstall').click();
 await page.locator('#tvHelp').click();assert.match(await page.locator('#help').textContent(),/same screen/);await page.locator('#closeHelp').click();
 const manifestUrl=new URL(await page.locator('link[rel=manifest]').getAttribute('href'),page.url());const manifest=await (await page.request.get(manifestUrl.href)).json();assert.equal(manifest.start_url,'./?v=ci-vr3.1');assert.equal(manifest.id,'./ci-vr');
 for(const icon of manifest.icons)assert.equal((await page.request.get(new URL(icon.src,manifestUrl).href)).status(),200);
 await page.locator('#start').click();await waitText(page,'badge','BUFFERING');
 assert.equal(await page.locator('#livePreview').isVisible(),true);assert.ok(await nonblack(page,'camera'),'live camera pixels during buffering');
 assert.equal(await page.locator('#captureMode').isDisabled(),true);
 await page.screenshot({path:'/tmp/lifting-buffering.png',fullPage:true});
 await waitText(page,'status','5s behind');await page.waitForFunction(()=>document.getElementById('replay').width===960);assert.ok(await nonblack(page,'replay'));
 assert.ok(!(await page.locator('#viewer').getAttribute('class')).includes('live-main'));
 await page.locator('#pause').click();await waitText(page,'status','Paused');const paused=Number(await page.locator('#scrub').inputValue());await page.waitForTimeout(350);assert.equal(Number(await page.locator('#scrub').inputValue()),paused);
 await page.locator('#speed').selectOption('0.25');await page.locator('#pause').click();await page.waitForTimeout(800);const advanced=Number(await page.locator('#scrub').inputValue())-paused;assert.ok(advanced>0.08&&advanced<0.4,'quarter speed actual playhead');
 await page.locator('#live').click();await waitText(page,'status','5s behind');
 await delay(page,30);await waitText(page,'badge','BUFFERING');assert.ok(await nonblack(page,'camera'));await waitText(page,'status','30s behind',35000);
 // The capture continues past 30 seconds; the delayed cursor is about 30 seconds behind retained newest frame.
 assert.equal(await page.locator('#stop').isEnabled(),true);
 const lag=await page.evaluate(()=>Number(document.getElementById('scrub').max)-Number(document.getElementById('scrub').value));assert.ok(lag>29&&lag<31,`30s delay: ${lag}`);
 await page.screenshot({path:'/tmp/lifting-running-mobile.png',fullPage:true});
 await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal(await page.locator('#screenStop').isVisible(),true);await page.evaluate(()=>document.exitFullscreen());
 await page.locator('#stop').click();assert.equal(await page.locator('#livePreview').isVisible(),false);
 await page.locator('#captureMode').selectOption('record');await delay(page,5);await page.locator('#start').click();await waitText(page,'badge','RECORDING');assert.ok(await nonblack(page,'camera'));
 await page.waitForTimeout(6100);assert.equal(await page.locator('#stop').isEnabled(),true,'recording does not stop after chosen delay');
 await page.screenshot({path:'/tmp/lifting-recording-mobile.png',fullPage:true});
 const stopAt=Date.now();await page.locator('#stop').click();await waitText(page,'status','Auto-replay in 5s');assert.equal(await page.locator('#scrub').isEnabled(),true);assert.equal(await page.locator('#pause').isEnabled(),true);assert.equal(await page.locator('#speed').isEnabled(),true);
 await page.screenshot({path:'/tmp/lifting-review-mobile.png',fullPage:true});
 await waitText(page,'status','Playing',6500);assert.ok(Date.now()-stopAt>=4900);assert.equal(await page.locator('#start').textContent(),'Record next');
 // Each manual review action independently cancels auto-replay.
 for(const action of ['scrub','pause','speed','back','forward']) {
   await page.locator('#start').click();await waitText(page,'badge','RECORDING');await page.waitForTimeout(500);await page.locator('#stop').click();await waitText(page,'status','Auto-replay');
   if(action==='scrub'){await page.locator('#scrub').focus();await page.locator('#scrub').press('ArrowRight');}
   else if(action==='speed')await page.locator('#speed').selectOption('0.5');
   else await page.locator('#'+action).click();
   await page.waitForTimeout(100);assert.ok(!(await page.locator('#status').textContent()).includes('Auto-replay'),`${action} cancels countdown`);
 }
 await page.waitForTimeout(5300);assert.equal(await page.locator('#status').textContent(),'Paused','no delayed interruption after manual review');
 await delay(page,30);await page.locator('#start').click();await waitText(page,'badge','RECORDING');await page.waitForTimeout(1100);await page.locator('#stop').click();await waitText(page,'status','Auto-replay in 30s');const longStop=Date.now();await waitText(page,'status','Playing',33000);assert.ok(Date.now()-longStop>=29000,'30 second countdown begins at Stop');await delay(page,5);
 await page.locator('#start').click();await waitText(page,'badge','RECORDING');await page.waitForTimeout(700);await page.locator('#stop').click();await waitText(page,'status','Auto-replay');await page.locator('#captureMode').selectOption('running');await page.waitForTimeout(100);assert.equal(await page.locator('#status').textContent(),'Paused','mode switch cancels countdown and retains clip');
 await page.locator('#start').click();await waitText(page,'badge','BUFFERING');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await waitText(page,'error','background');assert.equal(await page.locator('#start').isEnabled(),true);assert.equal(await page.evaluate(()=>document.getElementById('camera').srcObject),null);
 for(const size of [{width:360,height:740},{width:412,height:915},{width:915,height:412},{width:1440,height:900}]) {await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`layout ${size.width}`);}
 await page.screenshot({path:'/tmp/lifting-desktop.png',fullPage:true});
 await context.close();
 for(const kind of ['denied','pending','ended','memory']) {
 const c=await browser.newContext({permissions:['camera']});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(kind=>{
   if(kind==='denied') navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};
   if(kind==='pending') {const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{await new Promise(r=>setTimeout(r,500));const s=await get(...args);window.testStream=s;return s;};}
   if(kind==='memory') {const real=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){real.call(this,b=>{Object.defineProperty(b,'size',{value:70*1024*1024});cb(b);},...args);};}
 },kind);
 await p.goto(base);if(kind==='memory')await p.locator('#captureMode').selectOption('record');await p.locator('#start').click();
 if(kind==='denied'){await waitText(p,'error','permission was denied');assert.equal(await p.locator('#start').isEnabled(),true);}
 if(kind==='pending'){await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await p.waitForTimeout(1000);assert.ok(await p.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')));assert.equal(await p.locator('#start').isEnabled(),true);}
 if(kind==='ended'){await waitText(p,'badge','BUFFERING');await p.evaluate(()=>document.getElementById('camera').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended')));await waitText(p,'error','connection ended');assert.equal(await p.locator('#start').isEnabled(),true);}
 if(kind==='memory'){await waitText(p,'error','128 MiB memory limit');assert.equal(await p.locator('#pause').isEnabled(),true);assert.ok(!(await p.locator('#status').textContent()).includes('Auto-replay'));assert.equal(await p.locator('#start').textContent(),'Record next');}
 await c.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: visible camera pixels during buffering/recording; rendered delayed frames; 5s and 30s delay; continuous capture; manual Stop countdown and auto-replay; every review control cancels countdown; measured slowmo; scrub; retained clip; repeated sessions; mode switches; fullscreen stop; permission denial; pending permission cancellation; camera loss; background stop; memory-limit preservation; responsive layouts; manifests/icons. No browser exceptions.');
} finally {await browser.close();}
