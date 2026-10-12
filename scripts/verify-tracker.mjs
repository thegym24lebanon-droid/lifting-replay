import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const c=await b.newContext({viewport:{width:844,height:390},hasTouch:true});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
 navigator.mediaDevices.getUserMedia=async()=>{
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;const ctx=canvas.getContext('2d');let t0=performance.now();
  window.synthetic={occlude:false};
  const draw=()=>{const t=(performance.now()-t0)/1000;window.synthetic.t=t;ctx.fillStyle='#202020';ctx.fillRect(0,0,480,270);
    const x=Math.round(100+15*t),y=Math.round(170-40*Math.sin(t*.8));window.synthetic.position={x,y};
    const patch=(cx,cy,target)=>{for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++){const v=target?70+((dx*dx*11+dy*dy*7+dx*dy*19+1000)%180):((dx+dy)%2?230:50);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(cx+dx,cy+dy,1,1);}};
    if(!(window.synthetic.occlude&&t>2&&t<2.5))patch(x,y,true);patch(x+35,y+20,false);
  };draw();const timer=setInterval(draw,33);const stream=canvas.captureStream(15);const track=stream.getVideoTracks()[0];const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};return stream;
 };
 });
 await p.goto(process.env.APP_URL||'http://localhost:4173');await p.locator('#captureMode').selectOption('record');await p.locator('#delay').fill('30');await p.locator('#delay').dispatchEvent('input');
 const waitDraw=()=>p.waitForFunction(()=>document.getElementById('replay').width===480);
 const seek=async(f)=>{await p.locator('#fsScrub').evaluate((el,f)=>{el.value=Number(el.min)+(Number(el.max)-Number(el.min))*f;el.dispatchEvent(new Event('input',{bubbles:true}));},f);await p.waitForTimeout(100);};
 const tapPoint=async(x,y)=>{const r=await p.locator('#replay').boundingBox();const scale=Math.min(r.width/480,r.height/270);await p.touchscreen.tap(r.x+(r.width-480*scale)/2+x*scale,r.y+(r.height-270*scale)/2+y*scale);};
 const cyan=()=>p.evaluate(()=>{const c=document.getElementById('replay'),a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0,minX=Infinity,maxX=0;for(let i=0;i<a.length;i+=4)if(a[i]<30&&a[i+1]>180&&a[i+2]>180){n++;minX=Math.min(minX,(i/4)%c.width);maxX=Math.max(maxX,(i/4)%c.width);}return {n,minX,maxX};});
 await p.locator('#start').click();await p.waitForTimeout(4200);await p.locator('#fullscreen').click();await p.locator('#screenStop').click();await waitDraw();await p.waitForTimeout(100);
 await p.locator('#trackBar').click();await tapPoint(101,169);await p.waitForFunction(()=>document.getElementById('trackBar').textContent==='Reselect bar');assert.ok(!(await p.locator('#status').textContent()).includes('Auto-replay'));
 await seek(.95);await p.waitForFunction(()=>document.getElementById('trackStatus').textContent.includes('Experimental bar path'),{},{timeout:20000});await p.waitForTimeout(150);
 const full=await cyan();assert.ok(full.n>70,JSON.stringify(full));assert.ok(full.maxX-full.minX>40,'known horizontal travel traced');assert.ok(!(await p.locator('#trackStatus').textContent()).includes('lost'));
 await seek(.1);await p.waitForTimeout(150);const back=await cyan();assert.ok(back.n>full.n*.8,'full path remains when scrubbing backward');assert.ok(Math.abs(back.maxX-full.maxX)<8);
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);assert.ok((await cyan()).n>full.n*.8);
 await p.locator('#fullscreen').click();await p.waitForFunction(()=>!document.fullscreenElement);await p.locator('#fullscreen').click();await p.waitForFunction(()=>!!document.fullscreenElement);assert.ok((await cyan()).n>full.n*.8);
 await p.locator('#fsSpeed').selectOption('0.25');await p.locator('#fsPause').click();await p.waitForTimeout(350);await seek(.4);assert.equal(await p.locator('#fsSpeed').inputValue(),'0.25');
 await p.locator('#trackBar').click();const elapsed=await p.locator('#fsScrub').inputValue().then(Number);await tapPoint(Math.round(100+15*elapsed),Math.round(170-40*Math.sin(elapsed*.8)));await p.waitForTimeout(150);await seek(.8);await p.waitForTimeout(1500);assert.ok(!(await p.locator('#trackStatus').textContent()).includes('lost'));
 await p.screenshot({path:'/tmp/video-replay-tracker.png'});await p.setViewportSize({width:844,height:390});await p.waitForTimeout(100);await p.screenshot({path:'/tmp/video-replay-tracker-landscape.png'});await p.locator('#clearTrack').click();await p.waitForTimeout(100);assert.equal((await cyan()).n,0);
 await p.locator('#fullscreen').click();await p.locator('#start').click();await p.evaluate(()=>window.synthetic.occlude=true);await p.waitForTimeout(4000);await p.locator('#stop').click();await p.waitForTimeout(100);await p.locator('#fullscreen').click();await p.locator('#trackBar').click();await tapPoint(101,169);await p.waitForTimeout(100);await seek(.95);
 await p.waitForFunction(()=>document.getElementById('trackStatus').textContent.includes('Tracking lost'),{},{timeout:15000});assert.equal(await p.locator('#fsPause').textContent(),'Play');assert.ok(Number(await p.locator('#fsScrub').inputValue())<2.2,'stop at last reliable position before occlusion');
 await seek(.85);await p.locator('#trackBar').click();const t=await p.locator('#fsScrub').inputValue().then(Number);await tapPoint(Math.round(100+15*t),Math.round(170-40*Math.sin(t*.8)));await p.waitForTimeout(100);await seek(.97);await p.waitForTimeout(900);assert.ok(!(await p.locator('#trackStatus').textContent()).includes('lost'));
 await p.locator('#fullscreen').click();await p.locator('#captureMode').selectOption('running');await p.locator('#delay').fill('5');await p.locator('#delay').dispatchEvent('input');await p.locator('#start').click();await p.waitForTimeout(6200);await p.locator('#fullscreen').click();await p.locator('#trackBar').click();const liveT=await p.locator('#fsScrub').inputValue().then(Number);await tapPoint(Math.round(100+15*liveT),Math.round(170-40*Math.sin(liveT*.8)));await p.waitForTimeout(150);const before=Number(await p.locator('#fsScrub').getAttribute('max'));await p.locator('#fsPause').click();await p.waitForTimeout(1400);assert.equal(await p.locator('#screenStop').isVisible(),true);assert.ok(Number(await p.locator('#fsScrub').getAttribute('max'))>before+1);assert.ok((await cyan()).n>10,'track during ongoing capture');await p.locator('#fsPause').click();await p.locator('#fullscreen').click();await p.screenshot({path:'/tmp/video-replay-tracker-page.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS browser synthetic target: fullscreen touch selection; known path with distractor; full trail persists through reverse/forward scrubbing and orientation/fullscreen changes; slow playback; clear/reselect; occlusion loss pauses and reselection resumes. No uploads or browser exceptions.');
}finally{await b.close();}
