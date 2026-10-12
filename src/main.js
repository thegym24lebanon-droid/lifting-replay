import './style.css';
import { ReplayBuffer, delayedTime } from './buffer.js';
import { BarPath, videoPoint } from './tracker.js';
const $ = id => document.getElementById(id);
let saved = {}; try { saved = JSON.parse(localStorage.getItem('lifting-settings') || '{}'); } catch {}
const settings = {delay: Math.max(5, Math.min(30, Number(saved.delay) || 10)), facing: saved.facing === 'user' ? 'user' : 'environment'};
const persist = () => { try { localStorage.setItem('lifting-settings', JSON.stringify(settings)); } catch {} };
$('app').innerHTML = `
<header><a class="brand" href="./"><img src="./icons/ci-vr-v4-192.png" alt="CI VR"><span>Video Replay</span></a><div class="header-actions"><button id="tvHelp">Connect to TV</button><button id="install" aria-label="Add to home screen">Install</button></div></header>
<main><div class="setup"><label>Mode<select id="captureMode"><option value="running">Running Camera</option><option value="record">Record &amp; Review</option></select></label><label>Camera<select id="facing"><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label><label class="delay-control"><span><span id="delayTitle">Replay delay</span> <strong id="delayValue"></strong></span><input id="delay" aria-label="Delay in seconds" type="range" min="5" max="30" step="1"></label></div>
<section class="viewer" id="viewer"><canvas id="replay" aria-label="Replay"></canvas><div id="empty">Start camera to see your framing</div><div id="livePreview" hidden><video id="camera" muted playsinline autoplay></video><span>LIVE</span></div><div class="bar-tools"><div><button id="trackBar" disabled>Track bar</button><button id="clearTrack" hidden>Clear path</button></div><span id="trackStatus" role="status" hidden></span></div><div class="viewer-top"><div class="viewer-state"><img class="fullscreen-brand" src="./icons/ci-vr-v4-192.png" alt="CI VR"><span id="badge">CAMERA OFF</span></div><button id="fullscreen">Full screen</button></div><div class="viewer-bottom"><span id="status" role="status">Ready</span><button id="screenStop" hidden>Stop</button></div><div class="fullscreen-transport"><div class="timeline-title"><label for="fsScrub">Replay timeline</label><span id="fsPosition">0:00 / 0:00</span></div><input id="fsScrub" aria-label="Full-screen replay timeline" type="range" min="0" max="0" value="0" step="0.01" disabled><div class="transport-row"><button id="fsPause" class="primary" disabled>Play</button><label>Speed<select id="fsSpeed" disabled><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><button id="fsLive" disabled>Return to delay</button></div></div></section>
<div class="capture-controls"><button id="start" class="primary">Start camera</button><button id="stop" disabled>Stop</button><span id="storage">Up to 90s rolling review</span></div>
<section class="transport"><div class="timeline-title"><span id="reviewLabel">Replay</span><span id="position">0:00 / 0:00</span></div><input id="scrub" aria-label="Replay timeline" type="range" min="0" max="0" value="0" step="0.01" disabled><div class="transport-row"><button id="back" disabled>−5s</button><button id="pause" class="primary" disabled>Play</button><button id="forward" disabled>+5s</button><label>Speed<select id="speed" disabled><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><button id="live" disabled>Return to delay</button></div></section><p id="error" role="alert" hidden></p>
<dialog id="help"><h2>Connect to TV</h2><p>On your Galaxy, open Quick Settings → <strong>Smart View</strong>, select your ScreenCast receiver, and accept the connection. Return here and use Full screen.</p><p>The phone and TV show the same screen, including the LIVE preview. ScreenCast adds its own latency beyond the selected delay.</p><p>Keep this page open and the screen awake. If the receiver is missing, check its Android / Miracast mode and compatibility, or use a compatible USB-C to HDMI connection.</p><button id="closeHelp" class="primary">Done</button></dialog>
<dialog id="installHelp"><h2>Add to home screen</h2><p>Open this link in Chrome. Remove the old replay shortcut, then tap Chrome’s ⋮ menu → Add to home screen → Install or Create shortcut. Leave your separate CI program in place.</p><p>Internet is required to open the app. Footage is temporary and clears on reload.</p><button id="closeInstall" class="primary">Done</button></dialog></main>`;
$('delay').value = settings.delay; $('delayValue').textContent = `${settings.delay}s`; $('facing').value = settings.facing;
const buffer = new ReplayBuffer(90, 96 * 1024 * 1024);
let mode = 'running', stream, timer, running = false, starting = false, busy = false, drawing = false, lastFrame, origin = 0, playhead = 0, follow = true, paused = true, speed = 1, previousTick = 0, wake, session = 0, countdown = null;
const capture = document.createElement('canvas');
const trackCanvas = document.createElement('canvas');
let selectingBar = false, reportedLoss = null, trackingWork = false;
const barPath = new BarPath(async frame => {
  const bitmap = await createImageBitmap(frame.blob);
  try {
    trackCanvas.width = Math.min(480,bitmap.width);
    trackCanvas.height = Math.round(bitmap.height*trackCanvas.width/bitmap.width);
    const ctx=trackCanvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,trackCanvas.width,trackCanvas.height);
    const rgba=ctx.getImageData(0,0,trackCanvas.width,trackCanvas.height).data;
    const data=new Uint8Array(trackCanvas.width*trackCanvas.height);
    for(let i=0;i<data.length;i++)data[i]=(rgba[i*4]*77+rgba[i*4+1]*150+rgba[i*4+2]*29)>>8;
    return {data,width:trackCanvas.width,height:trackCanvas.height};
  } finally { bitmap.close(); }
});
function trackMessage(message) { $('trackStatus').textContent=message; $('trackStatus').hidden=!message; }
function clearTracking() {barPath.clear();selectingBar=false;reportedLoss=null;lastFrame=null;$('clearTrack').hidden=true;$('trackBar').textContent='Track bar';$('replay').classList.remove('select-bar');trackMessage('');}
function paintPath(canvas,time) {
  const points=barPath.points.filter(p=>p.time>=buffer.first);if(!points.length)return;
  const ctx=canvas.getContext('2d');
  for(const [color,width] of [['#000',6],['#00e5ff',3]]) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.beginPath();
    let segment=null;for(const p of points){if(p.segment!==segment)ctx.moveTo(p.x*canvas.width,p.y*canvas.height);else ctx.lineTo(p.x*canvas.width,p.y*canvas.height);segment=p.segment;}ctx.stroke();
  }
  const tip=barPath.visible(time,buffer.first).at(-1);if(!tip || time-tip.time>.35)return;ctx.beginPath();ctx.arc(tip.x*canvas.width,tip.y*canvas.height,6,0,Math.PI*2);ctx.fillStyle='#ffe45c';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.stroke();
}

const seconds = () => (performance.now() - origin) / 1000;
const fmt = n => `${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
function controls(enabled) { for (const id of ['back','pause','forward','scrub','speed','fsScrub','fsPause','fsSpeed','trackBar']) $(id).disabled = !enabled; $('live').disabled = $('fsLive').disabled = !enabled || !running || mode !== 'running'; }
function layout(warming = false) {
  $('livePreview').hidden = !running;
  $('viewer').classList.toggle('live-main', running && (mode === 'record' || warming));
  $('screenStop').hidden = !running;
  $('live').hidden = $('fsLive').hidden = mode === 'record';
}
async function sample() {
  if (!running || busy || !$('camera').videoWidth) return;
  busy = true; const token = session;
  try {
    const video = $('camera'), w = Math.min(960, video.videoWidth);
    capture.width = w; capture.height = Math.round(video.videoHeight * w / video.videoWidth);
    capture.getContext('2d').drawImage(video,0,0,capture.width,capture.height);
    const time = seconds(), blob = await new Promise(resolve => capture.toBlob(resolve,'image/jpeg',0.72));
    if (blob && running && token === session) {
      if (!buffer.add(time,blob)) { stop(false); error('Recording stopped at the 128 MiB memory limit. Your complete captured footage is ready to review. Record next clears this clip.'); }
    }
  } catch { if (token === session) { stop(false); error('Camera frames could not be captured. Retained footage is available; try starting again.'); } }
  finally { busy = false; }
}
async function start() {
  if (running || starting) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { error('Camera access requires a trusted HTTPS link. Open this app in Chrome.'); return; }
  const token = ++session; starting = true; $('start').disabled = true; $('captureMode').disabled = true; $('facing').disabled = true; error('');
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:settings.facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:15}},audio:false});
    if (token !== session) { acquired.getTracks().forEach(t=>t.stop()); return; }
    stream = acquired; $('camera').srcObject = stream;
    await $('camera').play();
    if (token !== session) return;
    clearTracking(); buffer.clear(); buffer.seconds = mode === 'running' ? 90 : Infinity; buffer.maxBytes = (mode === 'running' ? 96 : 128) * 1024 * 1024; buffer.retainAll = mode === 'record';
    countdown = null; origin = performance.now(); previousTick = origin; playhead = 0; follow = mode === 'running'; paused = false; speed = 1; $('speed').value = '1'; lastFrame = null;
    $('replay').getContext('2d').clearRect(0,0,$('replay').width,$('replay').height);
    running = true; $('empty').hidden = true; $('stop').disabled = false; $('start').textContent = mode === 'record' ? 'Recording' : 'Camera running'; controls(false); layout(true);
    stream.getVideoTracks()[0].addEventListener('ended',() => { if(running && token === session) { stop(false); error('Camera connection ended. Retained footage is ready to review.'); } });
    timer = setInterval(sample, 1000/15); await sample();
    try { const lock = await navigator.wakeLock?.request('screen'); if (running && token === session) wake = lock; else lock?.release().catch(()=>{}); } catch {}
  } catch (e) {
    if (token === session) { stop(false); error(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in Chrome settings, then try again.' : `Could not start camera: ${e.message}`); }
  } finally { if (token === session) { starting = false; $('start').disabled = running; $('captureMode').disabled = running; $('facing').disabled = running; } }
}
function stop(autoReplay = true) {
  const wasRunning = running, stoppedAt = performance.now();
  ++session; starting = false; running = false; clearInterval(timer); stream?.getTracks().forEach(t=>t.stop()); stream = null; $('camera').srcObject = null;
  wake?.release().catch(()=>{}); wake = null; follow = false; paused = true;
  countdown = autoReplay && wasRunning && mode === 'record' && buffer.frames.length ? stoppedAt + settings.delay * 1000 : null;
  if (wasRunning && mode === 'record') playhead = buffer.first;
  $('stop').disabled = true; $('start').disabled = false; $('start').textContent = mode === 'record' ? (buffer.frames.length ? 'Record next' : 'Start recording') : 'Start camera'; $('facing').disabled = false; $('captureMode').disabled = false;
  if (!buffer.frames.length) { $('empty').hidden = false; $('empty').textContent = 'No footage captured · start again'; }
  controls(buffer.frames.length > 0); layout();
}
function manual() { follow = false; countdown = null; }
function seek(value) { barPath.cancel(); manual(); playhead = Math.max(buffer.first, Math.min(buffer.last, value)); }
function traceTo(frame) {
  if (!frame || trackingWork || selectingBar || !barPath.tracker || barPath.lostAt!==null || frame.time<=barPath.time) return;
  trackingWork=true;const token=session;
  barPath.through([...buffer.frames],frame.time).then(()=>{
    if(token!==session)return;
    lastFrame=null;
    if(barPath.lostAt!==null && reportedLoss!==barPath.lostAt) {
      reportedLoss=barPath.lostAt;manual();paused=true;playhead=Math.max(buffer.first,barPath.time);
      trackMessage('Tracking lost · reselect the bar to continue');
    }
  }).catch(()=>{if(token===session){barPath.cancel();barPath.lostAt=frame.time;reportedLoss=frame.time;manual();paused=true;trackMessage('Tracking unavailable · reselect the bar');}}).finally(()=>{trackingWork=false;});
}
async function draw(frame) {
  if (!frame || drawing || frame === lastFrame) return;
  drawing = true; const token = session;
  try {
    const bitmap = await createImageBitmap(frame.blob);
    if (token === session) { const canvas = $('replay'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap,0,0); paintPath(canvas,frame.time); lastFrame = frame; }
    bitmap.close();
  } catch { error('Replay rendering failed. Try current Chrome on your Galaxy.'); }
  finally { drawing = false; }
}
function tick(now) {
  const dt = Math.min(0.25,(now - (previousTick || now))/1000); previousTick = now;
  const warming = running && mode === 'running' && follow && seconds() < settings.delay;
  if (countdown !== null && now >= countdown) { countdown = null; playhead = buffer.first; paused = false; }
  if (buffer.frames.length) {
    if (follow && running) playhead = delayedTime(seconds(),settings.delay,buffer.first);
    else if (!paused && !(running && mode === 'record')) { playhead = Math.min(buffer.last,playhead + dt * speed); if(!running && playhead >= buffer.last) paused = true; }
    playhead = Math.max(buffer.first,Math.min(buffer.last,playhead));
    if(!warming && !(running && mode === 'record')) { traceTo(buffer.at(playhead)); draw(buffer.at(playhead)); }
    controls(!warming && !(running && mode === 'record'));
    for (const id of ['scrub','fsScrub']) { $(id).min = buffer.first; $(id).max = buffer.last; $(id).value = playhead; }
    $('position').textContent = $('fsPosition').textContent = `${fmt(playhead-buffer.first)} / ${fmt(buffer.last-buffer.first)}`;
  }
  barPath.prune(buffer.first);
  if(barPath.busy && !selectingBar)trackMessage('Tracing recorded frames…');
  else if(barPath.tracker && barPath.lostAt===null && !selectingBar)trackMessage('Experimental bar path');
  layout(warming);
  $('pause').textContent = $('fsPause').textContent = paused ? 'Play' : 'Pause';
  $('fsSpeed').value = String(speed);
  $('badge').textContent = running ? (mode === 'record' ? 'RECORDING' : warming ? 'LIVE · BUFFERING' : 'DELAYED REPLAY') : buffer.frames.length ? 'REVIEW' : 'CAMERA OFF';
  $('status').textContent = countdown !== null ? `Auto-replay in ${Math.max(1,Math.ceil((countdown-now)/1000))}s · review now to cancel` : running && mode === 'record' ? `Recording ${fmt(seconds())} · tap Stop to review` : warming ? `Delayed replay in ${Math.ceil(settings.delay-seconds())}s` : running && follow ? `${settings.delay}s behind camera` : buffer.frames.length ? paused ? 'Paused' : `Playing · ${speed}×` : 'Ready';
  $('reviewLabel').textContent = follow && running ? 'Delayed replay' : 'Review';
  $('storage').textContent = mode === 'record' ? `${Math.ceil(buffer.bytes/1024/1024)} / 128 MiB · ${running ? 'Stop when finished' : 'Clip clears on Record next or reload'}` : `${Math.round(buffer.last-buffer.first)}s / up to 90s rolling review${buffer.thinned ? ' · reduced replay frame rate' : ''}`;
  requestAnimationFrame(tick);
}
$('trackBar').onclick = () => {
  manual();paused=true;barPath.cancel();selectingBar=true;
  // Anchor selection to the frame actually visible, not an undrawn next tick.
  if(lastFrame)playhead=lastFrame.time;
  $('replay').classList.add('select-bar');$('clearTrack').hidden=false;
  trackMessage('Tap the bar end. Keep the camera still.');
};
$('clearTrack').onclick = clearTracking;
$('replay').onpointerdown = async event => {
  if(!selectingBar || !lastFrame || event.button>0)return;
  event.preventDefault();event.stopPropagation();
  const canvas=$('replay');const point=videoPoint(event.clientX,event.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  if(!point)return;
  const frame=lastFrame;
  try {
    if(await barPath.select(frame,point.x/canvas.width,point.y/canvas.height)) {
      selectingBar=false;reportedLoss=null;lastFrame=null;canvas.classList.remove('select-bar');$('trackBar').textContent='Reselect bar';
      trackMessage('Bar selected · play or scrub to trace');
    }
  } catch(e) {trackMessage(e.message);}
};
$('start').onclick = start; $('stop').onclick = () => stop(); $('screenStop').onclick = () => stop();
$('captureMode').onchange = () => { mode = $('captureMode').value; countdown = null; $('delayTitle').textContent = mode === 'record' ? 'Replay after Stop' : 'Replay delay'; $('start').textContent = mode === 'record' ? (buffer.frames.length ? 'Record next' : 'Start recording') : 'Start camera'; layout(); };
$('delay').oninput = () => { settings.delay = Math.max(5,Math.min(30,Number($('delay').value))); $('delayValue').textContent = `${settings.delay}s`; persist(); };
$('facing').onchange = () => { settings.facing = $('facing').value; persist(); };
function scrub(value) { seek(value); paused = true; }
$('scrub').oninput = () => scrub(Number($('scrub').value));
$('fsScrub').oninput = () => scrub(Number($('fsScrub').value));
// Capture touch/mouse pointers inside the fullscreen element. Freeze the drag's
// time bounds while capture keeps adding frames; seek still clamps expired data.
let scrubDrag = null;
function dragScrub(event) {
  if (!scrubDrag || event.pointerId !== scrubDrag.id) return;
  event.preventDefault(); event.stopPropagation();
  const rect = $('fsScrub').getBoundingClientRect();
  const fraction = Math.max(0,Math.min(1,(event.clientX-rect.left-10)/Math.max(1,rect.width-20)));
  scrub(scrubDrag.first + fraction * (scrubDrag.last-scrubDrag.first));
}
$('fsScrub').onpointerdown = event => {
  if ($('fsScrub').disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
  scrubDrag = {id:event.pointerId,first:buffer.first,last:buffer.last};
  $('fsScrub').focus(); $('fsScrub').setPointerCapture(event.pointerId); dragScrub(event);
};
$('fsScrub').onpointermove = dragScrub;
$('fsScrub').onpointerup = event => {
  if (scrubDrag?.id !== event.pointerId) return;
  dragScrub(event); scrubDrag = null;
  if ($('fsScrub').hasPointerCapture(event.pointerId)) $('fsScrub').releasePointerCapture(event.pointerId);
};
$('fsScrub').onpointercancel = $('fsScrub').onlostpointercapture = () => { scrubDrag = null; };

$('back').onclick = () => seek(playhead-5); $('forward').onclick = () => seek(playhead+5);
$('pause').onclick = () => { manual(); if(paused && playhead >= buffer.last) playhead = buffer.first; paused = !paused; };
$('speed').onchange = () => { speed = Number($('speed').value); manual(); };
$('live').onclick = () => { if (running && mode === 'running') { follow = true; paused = false; speed = 1; $('speed').value = '1'; } };
$('fsPause').onclick = () => $('pause').click();
$('fsSpeed').onchange = () => { $('speed').value = $('fsSpeed').value; $('speed').onchange(); };
$('fsLive').onclick = () => $('live').click();
document.addEventListener('fullscreenchange',() => {
  scrubDrag = null;
  $('fullscreen').textContent = document.fullscreenElement === $('viewer') ? 'Exit full screen' : 'Full screen';
});
$('fullscreen').onclick = async () => { try { if(document.fullscreenElement) await document.exitFullscreen(); else await $('viewer').requestFullscreen(); } catch { error('Full screen is unavailable. Rotate the phone for a larger replay.'); } };
$('tvHelp').onclick = () => $('help').showModal(); $('closeHelp').onclick = () => $('help').close();
$('closeInstall').onclick = () => $('installHelp').close();
document.addEventListener('visibilitychange',()=>{ if(document.hidden && (running || starting)) { stop(false); error('Capture stopped because the app went into the background. Retained footage is ready to review.'); } else if(document.hidden) { countdown = null; paused = true; } });
window.addEventListener('pagehide',() => stop(false));
requestAnimationFrame(tick);
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
function markInstalled() { $('install').hidden = true; }
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) markInstalled();
window.addEventListener('appinstalled', markInstalled);
$('install').onclick = async () => { if (installPrompt) { const prompt = installPrompt; installPrompt = null; await prompt.prompt(); if ((await prompt.userChoice).outcome === 'accepted') markInstalled(); } else $('installHelp').showModal(); };
