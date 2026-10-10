import './style.css';
import { ReplayBuffer, delayedTime } from './buffer.js';
const $ = (id) => document.getElementById(id);
let saved = {}; try { saved = JSON.parse(localStorage.getItem('lifting-settings') || '{}'); } catch {}
const settings = {delay: Math.max(5, Math.min(30, Number(saved.delay) || 10)), facing: saved.facing === 'user' ? 'user' : 'environment'};
const persist = () => { try { localStorage.setItem('lifting-settings', JSON.stringify(settings)); } catch {} };
$('app').innerHTML = `
<header><a class="brand" href="./"><img class="brand-icon" src="./icons/ci-192.png" alt="CI"><span>LIFTING<span class="accent">REPLAY</span></span></a><span class="tag">YOUR NEXT REP, IN REVIEW</span></header>
<main><section class="intro"><div><p class="eyebrow">TRAIN. WATCH. ADJUST.</p><h1>See your lift.<br><span>Find your next improvement.</span></h1><p class="muted">A delayed replay for your phone and mirrored TV.</p></div><div class="intro-actions"><button id="install" class="secondary">＋ Add to home screen</button><button id="tvHelp" class="secondary">▣ Connect your TV</button></div></section>
<section class="workspace"><div class="viewer" id="viewer"><canvas id="replay" aria-label="Delayed camera replay"></canvas><div id="empty"><span class="camera-icon">◎</span><h2>Your replay starts here</h2><p>Place your phone where it can see the whole lift.</p><p>Start the camera, then mirror this screen to your TV.</p></div><div class="viewer-top"><span id="badge">CAMERA OFF</span><button id="fullscreen" class="glass">⛶ Full screen</button></div><div class="viewer-bottom"><span id="status" role="status" aria-live="polite">Ready when you are</span><span id="bufferLabel">90s rolling buffer</span></div><video id="camera" muted playsinline autoplay></video></div>
<aside><p class="eyebrow">CAMERA CONTROLS</p><h2>Set up your replay</h2><button id="start" class="primary">● Start camera</button><button id="stop" class="secondary" disabled>Stop camera</button><label class="field">Camera<select id="facing"><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label><div class="delay-title"><label for="delay">Replay delay</label><strong id="delayValue"></strong></div><input id="delay" type="range" min="5" max="30" step="1"><div class="range-labels"><span>5 seconds</span><span>30 seconds</span></div><p class="hint">Keep this page open and your screen awake. The replay has no audio.</p><div class="notice"><span class="dot"></span><div><strong>Private by design</strong><p>Camera frames stay on this device. They disappear when you leave.</p></div></div></aside></section>
<section class="transport"><div class="timeline-title"><strong id="mode">Delayed live replay</strong><span id="position">0:00 / 0:00</span></div><input id="scrub" aria-label="Replay timeline" type="range" min="0" max="0" value="0" step="0.05" disabled><div class="transport-row"><div class="buttons"><button id="back" class="secondary" disabled>↶ 5s</button><button id="pause" class="primary" disabled>Pause</button><button id="forward" class="secondary" disabled>5s ↷</button><button id="lift" class="secondary" disabled>↺ Replay last 15s</button></div><div class="speed"><label for="speed">Speed</label><select id="speed"><option value="1">1× Normal</option><option value="0.5">0.5× Slow</option><option value="0.25">0.25× Slow</option></select><button id="live" class="secondary" disabled>Return to delay</button></div></div></section>
<p id="error" role="alert" hidden></p><footer><span>Made for the moments between sets.</span><span>Phone → Screen mirroring → TV</span></footer>
<dialog id="help"><h2>Watch on your TV</h2><p>On your Galaxy, open Quick Settings → <strong>Smart View</strong>, select your TV, and accept the connection on the TV. Return here and use full screen.</p><p>Your j5create receiver must be in its Android / Miracast mode and support Samsung Smart View. Check the model’s instructions; do not assume every j5create 4K receiver uses the same mode. A Google Cast-only receiver may not appear in Smart View. A Vizio SmartCast label alone does not guarantee Smart View compatibility.</p><p>If Smart View cannot find the receiver, use a compatible Miracast receiver or a supported USB-C to HDMI connection. This app does not initiate Google Cast or upload video to the TV.</p><p>Camera access needs a trusted HTTPS address on your phone. Keep the app foregrounded. TV mirroring adds its own latency beyond your selected delay.</p><button id="closeHelp" class="primary">Got it</button></dialog></main>`;
$('delay').value = settings.delay; $('delayValue').textContent = `${settings.delay}s`; $('facing').value = settings.facing;
const buffer = new ReplayBuffer();
let stream, timer, running = false, busy = false, drawing = false, lastFrame, origin = 0, playhead = 0, follow = true, paused = false, speed = 1, previousTick = 0, wake;
const capture = document.createElement('canvas');
const seconds = () => (performance.now() - origin) / 1000;
const fmt = (n) => `${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
function controls(enabled) { for (const id of ['back','pause','forward','lift','live','scrub']) $(id).disabled = !enabled; }
async function sample() {
  if (!running || busy || !$('camera').videoWidth) return;
  busy = true; const sessionOrigin = origin;
  try {
    const video = $('camera'); const w = Math.min(640, video.videoWidth); capture.width = w; capture.height = Math.round(video.videoHeight * w / video.videoWidth);
    capture.getContext('2d').drawImage(video,0,0,capture.width,capture.height);
    const time = seconds(); const blob = await new Promise(resolve => capture.toBlob(resolve,'image/jpeg',0.7));
    if (blob && running && origin === sessionOrigin) buffer.add(time,blob);
  } finally { busy = false; }
}
async function start() {
  if (running) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { error('Camera access requires HTTPS on your phone. Open this app from a trusted HTTPS host; a phone cannot use an HTTP LAN address for camera access.'); return; }
  $('start').disabled = true; error('');
  try {
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:settings.facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:15}},audio:false});
    $('camera').srcObject = stream; await $('camera').play();
    buffer.clear(); origin = performance.now(); previousTick = origin; playhead = 0; follow = true; paused = false; speed = 1; $('speed').value = '1'; lastFrame = null;
    running = true; $('empty').hidden = true; $('stop').disabled = false; $('facing').disabled = true; $('start').textContent = '● Camera running'; controls(false); $('pause').textContent = 'Pause';
    stream.getVideoTracks()[0].addEventListener('ended',() => { if(running) { stop(); error('The camera stopped. Reopen the page in the foreground and start it again.'); } });
    timer = setInterval(sample, 1000/15); await sample();
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  } catch (e) { stream?.getTracks().forEach(t=>t.stop()); stream = null; $('start').disabled = false; error(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.' : `Could not start the camera: ${e.message}`); }
}
function stop() {
  running = false; clearInterval(timer); stream?.getTracks().forEach(t=>t.stop()); stream = null; $('camera').srcObject = null;
  wake?.release().catch(()=>{}); wake = null; follow = false; paused = true; $('pause').textContent = 'Play'; $('stop').disabled = true; $('start').disabled = false; $('start').textContent = '● Start new session'; $('facing').disabled = false;
}
function manual() { follow = false; }
function seek(value) { manual(); playhead = Math.max(buffer.first, Math.min(buffer.last, value)); }
async function draw(frame) {
  if (!frame || drawing || frame === lastFrame) return;
  drawing = true;
  try { const bitmap = await createImageBitmap(frame.blob); const canvas = $('replay'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap,0,0); bitmap.close(); lastFrame = frame; }
  catch { error('This browser could not render camera frames. Try current Chrome on your Galaxy.'); }
  finally { drawing = false; }
}
function tick(now) {
  const dt = Math.min(0.25,(now - (previousTick || now))/1000); previousTick = now;
  if (buffer.frames.length) {
    const elapsed = running ? seconds() : buffer.last;
    const warming = running && follow && elapsed < settings.delay;
    if (follow && running) playhead = delayedTime(elapsed,settings.delay,buffer.first);
    else if (!paused) { playhead = Math.min(buffer.last,playhead + dt * speed); if(!running && playhead >= buffer.last) { paused = true; $('pause').textContent = 'Play'; } }
    playhead = Math.max(buffer.first,Math.min(buffer.last,playhead));
    if(!warming) draw(buffer.at(playhead));
    controls(!warming); $('scrub').min = buffer.first; $('scrub').max = buffer.last; $('scrub').value = playhead;
    $('position').textContent = `${fmt(playhead)} / ${fmt(buffer.last)}`;
    $('badge').textContent = running ? (warming ? 'BUFFERING' : 'CAMERA ON') : 'CAMERA STOPPED';
    $('mode').textContent = follow ? 'Delayed live replay' : paused ? 'Replay paused' : `Replay · ${speed}×`;
    $('status').textContent = warming ? `Replay starts in ${Math.ceil(settings.delay-elapsed)}s` : follow ? `${settings.delay}s behind camera` : paused ? 'Paused · scrub to review your lift' : 'Reviewing your lift';
    $('bufferLabel').textContent = `${Math.round(buffer.last-buffer.first)}s available`;
  }
  requestAnimationFrame(tick);
}
$('start').onclick = start; $('stop').onclick = stop;
$('delay').oninput = () => { settings.delay = Number($('delay').value); $('delayValue').textContent = `${settings.delay}s`; persist(); };
$('facing').onchange = () => { settings.facing = $('facing').value; persist(); };
$('scrub').oninput = () => { seek(Number($('scrub').value)); paused = true; $('pause').textContent = 'Play'; };
$('back').onclick = () => seek(playhead-5); $('forward').onclick = () => seek(playhead+5);
$('pause').onclick = () => { manual(); paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
$('lift').onclick = () => { seek(buffer.last-15); paused = false; $('pause').textContent = 'Pause'; };
$('speed').onchange = () => { speed = Number($('speed').value); manual(); };
$('live').onclick = () => { if (!running) { error('Start the camera to return to a delayed live replay.'); return; } follow = true; paused = false; speed = 1; $('speed').value = '1'; $('pause').textContent = 'Pause'; };
$('fullscreen').onclick = async () => { try { if(document.fullscreenElement) await document.exitFullscreen(); else await $('viewer').requestFullscreen(); } catch { error('Full screen is unavailable in this browser. Rotate your phone to landscape for a larger replay.'); } };
$('tvHelp').onclick = () => $('help').showModal(); $('closeHelp').onclick = () => $('help').close();
document.addEventListener('visibilitychange',async()=>{ if(!document.hidden && running) { try { wake = await navigator.wakeLock?.request('screen'); } catch {} } });
window.addEventListener('pagehide',stop);
requestAnimationFrame(tick);

let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
});
function markInstalled() { $('install').hidden = true; }
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) markInstalled();
window.addEventListener('appinstalled', markInstalled);
$('install').onclick = async () => {
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') markInstalled();
  } else {
    const dialog = document.createElement('dialog');
    const title = document.createElement('h2'); title.textContent = 'Add Lifting Replay to your phone';
    const text = document.createElement('p'); text.textContent = 'In Chrome on your Galaxy, tap the three-dot menu → Add to home screen → Install (or Create shortcut). Confirm Add. The Lifting Replay icon will appear on your home screen. Open this site directly in Chrome if you are using an in-app browser. Internet is required to launch the app.';
    const close = document.createElement('button'); close.className = 'primary'; close.textContent = 'Got it'; close.onclick = () => { dialog.close(); dialog.remove(); };
    dialog.append(title,text,close); document.body.append(dialog); dialog.showModal();
  }
};
