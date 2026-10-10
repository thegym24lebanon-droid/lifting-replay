import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 const p=await b.newPage({permissions:['camera']});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
   const real=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(cb,...args){real.call(this,blob=>{Object.defineProperty(blob,'size',{value:2*1024*1024});cb(blob);},...args);};
 });
 await p.goto(process.env.APP_URL || 'http://localhost:4173');
 await p.locator('#delay').fill('5');await p.locator('#delay').dispatchEvent('input');await p.locator('#start').click();
 await p.waitForFunction(()=>document.getElementById('storage').textContent.includes('reduced replay frame rate'));
 await p.waitForTimeout(7500);
 assert.equal(await p.locator('#stop').isEnabled(),true,'running capture survives sustained byte pressure');
 assert.equal(await p.locator('#error').isVisible(),false);
 const lag=await p.evaluate(()=>Number(document.getElementById('scrub').max)-Number(document.getElementById('scrub').value));assert.ok(lag>4.8&&lag<5.2);
 assert.ok(await p.evaluate(()=>document.getElementById('camera').srcObject.getVideoTracks()[0].readyState==='live'));
 await p.locator('#stop').click();assert.equal(await p.locator('#pause').isEnabled(),true);
 await p.locator('#captureMode').selectOption('record');await p.locator('#start').click();
 await p.waitForFunction(()=>document.getElementById('error').textContent.includes('128 MiB memory limit'));
 assert.equal(await p.locator('#stop').isEnabled(),false,'only Record & Review stops at cap');
 assert.equal(await p.locator('#pause').isEnabled(),true);assert.equal(await p.locator('#start').textContent(),'Record next');
 assert.deepEqual(errors,[]);
 console.log('PASS: Running Camera continues under sustained 96 MiB pressure with delayed playback and a live camera; manual Stop retains review. Record & Review alone stops at 128 MiB and retains its clip.');
}finally{await b.close();}
