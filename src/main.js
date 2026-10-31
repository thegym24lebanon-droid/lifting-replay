import './style.css';
import { ReplayBuffer, delayedTime } from './buffer.js';
import { BarPath, videoPoint } from './tracker.js';
import { GalleryClip } from './gallery.js';
import { ReplayZoom } from './zoom.js';
import { frameIndex, snapFrame, adjacentFrame, FrameJog } from './frames.js';
const $ = id => document.getElementById(id);
let saved = {}; try { saved = JSON.parse(localStorage.getItem('lifting-settings') || '{}'); } catch {}
const settings = {delay: Math.max(5, Math.min(30, Number(saved.delay) || 10)), facing: saved.facing === 'user' ? 'user' : 'environment', fineScrub: saved.fineScrub !== false};
const persist = () => { try { localStorage.setItem('lifting-settings', JSON.stringify(settings)); } catch {} };
$('app').innerHTML = `
<header><a class="brand" href="./"><img src="./icons/civr-full-v9-192.png" alt="CI VR"><span>Video Replay</span></a><div class="header-actions"><button id="tvHelp">Connect to TV</button><button id="install" class="primary" aria-haspopup="dialog">Add to home screen</button></div></header>
<main><div class="setup"><label>Mode<select id="captureMode"><option value="running">Running Camera</option><option value="record">Record &amp; Review</option></select></label><label>Camera<select id="facing"><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label><label class="delay-control"><span><span id="delayTitle">Replay delay</span> <strong id="delayValue"></strong></span><input id="delay" aria-label="Delay in seconds" type="range" min="5" max="30" step="1"></label></div><input id="galleryFile" type="file" accept="video/*" aria-label="Choose a gallery video" hidden>
<section class="viewer" id="viewer"><canvas id="replay" aria-label="Replay"></canvas><div id="empty"><div class="empty-content"><img id="civrLogo" src="./branding/civr-logo-v4.png" alt="CIVR — Real. Intelligent. Coaching." width="1280" height="1280"><p id="emptyMessage">Start camera or choose a gallery video</p></div></div><div id="livePreview" hidden><video id="camera" muted playsinline autoplay></video><span>LIVE</span></div><div class="bar-tools"><div><button id="trackBar" disabled>Track bar</button><button id="clearTrack" hidden>Clear path</button></div><span id="trackStatus" role="status" hidden></span></div><div class="viewer-top"><div class="viewer-state"><img class="fullscreen-brand" src="./icons/civr-full-v9-192.png" alt="CI VR"><span id="badge">CAMERA OFF</span></div><button id="fullscreen">Full screen</button></div><div class="viewer-bottom"><span id="status" role="status">Ready</span><button id="screenStop" hidden>Stop</button></div><div class="fullscreen-transport"><div class="timeline-title"><label for="fsScrub">Replay timeline</label><span id="fsPosition">0:00 / 0:00</span></div><input id="fsScrub" aria-label="Full-screen replay timeline" type="range" min="0" max="0" value="0" step="0.01" disabled><div class="transport-row"><button id="fsPause" class="primary" disabled>Play</button><label>Speed<select id="fsSpeed" disabled><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><button id="fsLive" disabled>Return to delay</button></div></div></section>
<div class="capture-controls"><button id="start" class="primary">Start camera</button><button id="stop" disabled>Stop</button><button id="openGallery">Analyze gallery video</button><span id="storage">Up to 90s rolling review</span></div>
<section class="transport"><div class="timeline-title"><span id="reviewLabel">Replay</span><span id="position">0:00 / 0:00</span></div><input id="scrub" aria-label="Replay timeline" type="range" min="0" max="0" value="0" step="0.01" disabled><div class="transport-row"><button id="back" disabled>−5s</button><button id="pause" class="primary" disabled>Play</button><button id="forward" disabled>+5s</button><label>Speed<select id="speed" disabled><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></label><button id="live" disabled>Return to delay</button></div></section><p id="error" role="alert" hidden></p>
<dialog id="help"><h2>Connect to TV</h2><p>On your Galaxy, open Quick Settings → <strong>Smart View</strong>, select your ScreenCast receiver, and accept the connection. Return here and tap <strong>TV view</strong>.</p><p>Rotate the phone to landscape. If available, choose <strong>Full screen on connected device</strong> in Smart View’s aspect ratio settings. Tap <strong>Hide controls</strong> for the largest unobstructed picture; tap the picture to bring them back.</p><p>The whole video is preserved. Portrait videos have side borders on a wide TV. The phone and TV show the same screen; ScreenCast adds its own latency beyond the selected delay.</p><p>Keep this page open and the screen awake. If the receiver is missing, check its Android / Miracast mode and compatibility, or use a compatible USB-C to HDMI connection.</p><button id="closeHelp" class="primary">Done</button></dialog>
<dialog id="installHelp"><h2>Add to home screen</h2><img class="install-icon" src="./branding/civr-logo-v4.png" alt="CIVR — Real. Intelligent. Coaching."><p id="installInstructions">Open this page in Chrome, then tap <strong>⋮ → Add to home screen → Install</strong>. If Chrome offers <strong>Create shortcut</strong>, choose it.</p><p>You can add the installed app to your home screen by finding <strong>Video Replay</strong> in your app drawer, holding its icon, then tapping <strong>Add to Home</strong>.</p><p>Internet is required to open the app. Footage is temporary and clears on reload.</p><button id="closeInstall" class="primary">Done</button></dialog></main>`;
$('delay').value = settings.delay; $('delayValue').textContent = `${settings.delay}s`; $('facing').value = settings.facing;
const buffer = new ReplayBuffer(90, 96 * 1024 * 1024);
let mode = 'running', stream, timer, running = false, starting = false, busy = false, drawing = false, lastFrame, origin = 0, playhead = 0, follow = true, paused = true, speed = 1, previousTick = 0, wake, session = 0, countdown = null;
let gallery = null, loadingGallery = false, pendingGallery = null;
const screenActions = document.createElement('div'); screenActions.className = 'screen-actions';
screenActions.innerHTML = '<button id="screenStart" class="primary">Turn camera on</button><button id="screenGallery">Gallery video</button>';
$('screenStop').before(screenActions);
const screenError = document.createElement('p'); screenError.id = 'screenError'; screenError.setAttribute('role','alert'); screenError.hidden = true;
$('viewer').append(screenError);
let tvMode = false, tvHiddenBy = null, tvTimer = null, tvOrientationOwned = false, tvWasPlaying = false;
const displayActions = document.createElement('div'); displayActions.className = 'display-actions';
$('fullscreen').before(displayActions); displayActions.append($('fullscreen'));
const tvButton = document.createElement('button'); tvButton.id = 'tvView'; tvButton.textContent = 'TV view';
displayActions.prepend(tvButton);
const hideButton = document.createElement('button'); hideButton.id = 'hideTVControls'; hideButton.textContent = 'Hide controls';
displayActions.prepend(hideButton);
const showButton = document.createElement('button'); showButton.id = 'showTVControls'; showButton.textContent = 'Show controls';
$('viewer').append(showButton);
const tvHint = document.createElement('p'); tvHint.id = 'tvHint'; tvHint.textContent = 'Whole video preserved. Use landscape; in Smart View settings, choose “Full screen on connected device” if available.';
$('viewer').append(tvHint);
function showTVControls(restart = true) {
  clearTimeout(tvTimer); tvHiddenBy = null; $('viewer').classList.remove('tv-controls-hidden');
  if (restart && tvMode && !paused && !selectingBar && !trackingHold) tvTimer = setTimeout(() => hideTVControls('auto'), 4000);
}
function hideTVControls(reason) {
  if (!tvMode || selectingBar || trackingHold || (reason === 'auto' && paused)) return;
  clearTimeout(tvTimer); tvHiddenBy = reason; $('viewer').classList.add('tv-controls-hidden');
}
function leaveTVView() {
  tvMode = false; showTVControls(false); $('viewer').classList.remove('tv-mode'); document.body.classList.remove('tv-view-open');
  tvButton.textContent = 'TV view'; if (tvOrientationOwned) screen.orientation?.unlock?.(); tvOrientationOwned = false;
}
tvButton.onclick = async () => {
  if (tvMode) { leaveTVView(); return; }
  tvMode = true; zoom.reset(); $('viewer').classList.add('tv-mode'); document.body.classList.add('tv-view-open');
  tvButton.textContent = 'Exit TV view'; showTVControls();
  try { if (!document.fullscreenElement) await $('viewer').requestFullscreen(); } catch {}
  try { if (screen.orientation?.lock) { await screen.orientation.lock('landscape'); if (tvMode) tvOrientationOwned = true; else screen.orientation.unlock?.(); } } catch {}
};
hideButton.onclick = () => hideTVControls('manual'); showButton.onclick = () => showTVControls();
$('viewer').addEventListener('pointerdown', () => { if (tvMode) showTVControls(); }, { capture: true });
for (const [range, prefix] of [['scrub',''],['fsScrub','fs']]) {
  $(range).step = 'any';
  const controls = document.createElement('div'); controls.className = 'frame-controls';
  const id = name => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
  controls.innerHTML = `<button id="${id('prevFrame')}" aria-label="Previous frame" disabled>‹ Frame</button><button id="${id('nextFrame')}" aria-label="Next frame" disabled>Frame ›</button><button id="${id('fineScrub')}" aria-pressed="${settings.fineScrub}">Fine scrub</button><span id="${id('frameInfo')}">No frames yet</span>`;
  $(range).after(controls);
}
const capture = document.createElement('canvas');
const trackCanvas = document.createElement('canvas');
let selectingBar = false, reportedLoss = null, trackingWork = false, draftPoint = null, trackingHold = null;
const viewport = document.createElement('div'); viewport.id = 'replayViewport';
$('replay').before(viewport); viewport.append($('replay'));
const zoomTools = document.createElement('div'); zoomTools.className = 'zoom-tools';
zoomTools.innerHTML = '<button id="zoomOut" aria-label="Zoom out">−</button><output id="zoomLevel" aria-label="Zoom level">1×</output><button id="zoomIn" aria-label="Zoom in">+</button><button id="zoomReset" aria-label="Reset zoom">Reset</button>';
document.querySelector('.bar-tools>div').append(zoomTools);
const zoom = new ReplayZoom(viewport, $('replay'), {
  enabled: () => hasFootage() && !starting && !loadingGallery && !$('viewer').classList.contains('live-main'),
  selecting: () => selectingBar,
  draft: screen => {
    draftPoint = screen ? pointAt(screen) : null;
    lastFrame = null;
  },
  select: screen => selectBarAt(screen),
  changed: scale => { $('zoomLevel').textContent = `${Number(scale.toFixed(1))}×`; }
});
$('zoomIn').onclick = () => zoom.zoom(1.5);
$('zoomOut').onclick = () => zoom.zoom(1/1.5);
$('zoomReset').onclick = () => zoom.reset();
const barPath = new BarPath(async frame => {
  if (frame.image) return frame.image;
  if (frame.gallery) {
    if (!gallery) throw new Error('Gallery video closed.');
    return gallery.read(frame.time);
  }
  const bitmap = await createImageBitmap(frame.blob);
  try {
    trackCanvas.width = Math.min(640,bitmap.width);
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
function clearTracking() {barPath.clear();trackingHold=null;selectingBar=false;draftPoint=null;reportedLoss=null;lastFrame=null;$('clearTrack').hidden=true;$('trackBar').textContent='Track bar';$('replay').classList.remove('select-bar');trackMessage('');}
function paintPath(canvas,time) {
  const points=barPath.points.filter(p=>p.time>=firstTime());
  const ctx=canvas.getContext('2d');
  for(const [color,width] of [['#000',6],['#00e5ff',3]]) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.beginPath();
    let segment=null;for(const p of points){if(p.segment!==segment)ctx.moveTo(p.x*canvas.width,p.y*canvas.height);else ctx.lineTo(p.x*canvas.width,p.y*canvas.height);segment=p.segment;}ctx.stroke();
  }
  const tip=barPath.visible(time+.001,firstTime()).at(-1);
  if(tip) { ctx.beginPath();ctx.arc(tip.x*canvas.width,tip.y*canvas.height,6,0,Math.PI*2);ctx.fillStyle='#ffe45c';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.stroke(); }
  if(draftPoint && Math.abs(draftPoint.frame.time-time)<.01) {
    const fit=Math.min(viewport.clientWidth/canvas.width,viewport.clientHeight/canvas.height)*zoom.state.scale;
    const x=draftPoint.x*canvas.width,y=draftPoint.y*canvas.height,r=9/Math.max(.01,fit);
    ctx.lineWidth=2/Math.max(.01,fit);ctx.strokeStyle='#ffe45c';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-r/2,y);ctx.lineTo(x+r/2,y);ctx.moveTo(x,y-r/2);ctx.lineTo(x,y+r/2);ctx.stroke();
  }
}

const seconds = () => (performance.now() - origin) / 1000;
const fmt = n => `${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
function error(message) { $('error').textContent = $('screenError').textContent = message; $('error').hidden = $('screenError').hidden = !message; }
function firstTime() { return gallery ? 0 : buffer.first; }
function lastTime() { return gallery ? gallery.duration : buffer.last; }
function hasFootage() { return !!gallery || buffer.frames.length > 0; }
let timelineCache = { count: -1, first: null, last: null, times: [] };
function frameTimes() {
  if (gallery) return gallery.frameTimes ?? [];
  if (timelineCache.count !== buffer.frames.length || timelineCache.first !== buffer.first || timelineCache.last !== buffer.last) {
    timelineCache = { count: buffer.frames.length, first: buffer.first, last: buffer.last, times: buffer.frames.map(frame => frame.time) };
  }
  return timelineCache.times;
}
function updateFrameControls() {
  const times = frameTimes(), index = frameIndex(times, playhead), ready = hasFootage() && !$('scrub').disabled && times.length > 0;
  for (const prefix of ['', 'fs']) {
    const id = name => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
    $(id('prevFrame')).disabled = !ready || index <= 0;
    $(id('nextFrame')).disabled = !ready || index >= times.length - 1;
    $(id('fineScrub')).disabled = !ready;
    $(id('fineScrub')).setAttribute('aria-pressed', String(settings.fineScrub));
    $(id('fineScrub')).textContent = gallery && !times.length ? 'Time scrub' : settings.fineScrub ? 'Fine scrub' : 'Overview';
    $(id('frameInfo')).textContent = times.length ? `Frame ${index+1} / ${times.length}` : gallery ? 'Frame steps unavailable' : 'No frames yet';
  }
}
function controls(enabled) { for (const id of ['back','pause','forward','scrub','speed','fsScrub','fsPause','fsSpeed','trackBar','zoomIn','zoomOut','zoomReset']) $(id).disabled = !enabled; viewport.classList.toggle('zoom-enabled', enabled); $('live').disabled = $('fsLive').disabled = !enabled || !running || mode !== 'running'; }
function layout(warming = false) {
  $('viewer').classList.toggle('camera-idle', !running && !hasFootage());
  $('viewer').classList.toggle('placing-bar', selectingBar);
  $('livePreview').hidden = !running || selectingBar || zoom.state.scale>1;
  $('viewer').classList.toggle('live-main', running && (mode === 'record' || warming));
  $('screenStop').hidden = !running;
  $('live').hidden = $('fsLive').hidden = mode === 'record' || !!gallery;
  $('screenStart').hidden = running;
  $('screenStart').disabled = $('start').disabled = starting || running || loadingGallery;
  $('screenStart').textContent = starting ? 'Starting camera…' : mode === 'record' ? 'Start recording' : 'Turn camera on';
  $('screenGallery').disabled = $('openGallery').disabled = starting || loadingGallery;
  $('captureMode').disabled = $('facing').disabled = starting || running || loadingGallery || !!gallery;
  document.querySelector('.setup').hidden = !!gallery;
  if (gallery) $('start').textContent = 'Turn camera on';
}
function openGallery() {
  if (starting || loadingGallery) return;
  if (running) stop(false);
  manual(); paused = true; gallery?.pause();
  $('galleryFile').click();
}
async function loadGallery(file) {
  if (!file || loadingGallery || starting) return;
  if (file.type && !file.type.startsWith('video/')) { error('Choose a video from your gallery.'); return; }
  if (running) stop(false);
  manual(); paused = true; gallery?.pause(); error(''); loadingGallery = true;
  const candidate = new GalleryClip(file); pendingGallery = candidate;
  try {
    await candidate.load();
    if (pendingGallery !== candidate) { candidate.close(); return; }
    ++session; clearTracking(); zoom.reset(); gallery?.close(); gallery = candidate;
    buffer.clear(); playhead = 0; paused = true; speed = 1; $('speed').value = '1';
    $('empty').hidden = true; $('stop').disabled = true;
    candidate.video.addEventListener('error', () => { if (gallery === candidate) { gallery.pause(); paused = true; error('This video cannot be played in this browser. Try an H.264 MP4 file.'); } });
  } catch (e) {
    candidate.close(); if (pendingGallery === candidate) error(e.message);
  } finally {
    if (pendingGallery === candidate) { pendingGallery = null; loadingGallery = false; }
    $('galleryFile').value = ''; layout();
  }
}
function drawGallery() {
  const video = gallery.video;
  if (video.seeking || video.readyState < 2 || lastFrame?.time === video.currentTime) return;
  const canvas = $('replay'); canvas.width = Math.min(960, video.videoWidth); canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  paintPath(canvas, video.currentTime); lastFrame = { time: video.currentTime, gallery: true };
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
  if (running || starting || loadingGallery) return;
  gallery?.pause(); barPath.cancel(); paused = true;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { error('Camera access requires a trusted HTTPS link. Open this app in Chrome.'); return; }
  const token = ++session; starting = true; $('start').disabled = true; $('captureMode').disabled = true; $('facing').disabled = true; error('');
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:settings.facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:15}},audio:false});
    if (token !== session) { acquired.getTracks().forEach(t=>t.stop()); return; }
    stream = acquired; $('camera').srcObject = stream;
    await $('camera').play();
    if (token !== session) return;
    clearTracking(); zoom.reset(); gallery?.close(); gallery = null; buffer.clear(); buffer.seconds = mode === 'running' ? 90 : Infinity; buffer.maxBytes = (mode === 'running' ? 96 : 128) * 1024 * 1024; buffer.retainAll = mode === 'record';
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
  trackingHold = null;
  const wasRunning = running, stoppedAt = performance.now();
  ++session; starting = false; running = false; clearInterval(timer); stream?.getTracks().forEach(t=>t.stop()); stream = null; $('camera').srcObject = null;
  wake?.release().catch(()=>{}); wake = null; follow = false; paused = true;
  countdown = autoReplay && wasRunning && mode === 'record' && buffer.frames.length ? stoppedAt + settings.delay * 1000 : null;
  if (wasRunning && mode === 'record') playhead = buffer.first;
  $('stop').disabled = true; $('start').disabled = false; $('start').textContent = mode === 'record' ? (buffer.frames.length ? 'Record next' : 'Start recording') : 'Start camera'; $('facing').disabled = false; $('captureMode').disabled = false;
  gallery?.pause();
  if (!hasFootage()) { $('empty').hidden = false; $('emptyMessage').textContent = 'No footage captured · start again'; }
  controls(hasFootage()); layout();
}
function manual(cancelHold = true) { follow = false; countdown = null; if (cancelHold && trackingHold) { trackingHold = null; paused = true; gallery?.pause(); } }
function seek(value, exactFrame = false) { manual(); playhead = Math.max(firstTime(), Math.min(lastTime(), value)); if (gallery) { if (exactFrame) gallery.seekFrame(playhead); else gallery.seek(playhead); } }
function trackingEnd() { return gallery?.frameTimes?.at(-1) ?? lastTime(); }
function traceTo(frame) {
  if (!frame || trackingWork || selectingBar || !barPath.tracker || barPath.lostAt!==null) return;
  const times=frameTimes(), limit=times.length ? times[Math.min(times.length-1,frameIndex(times,barPath.time)+12)] : barPath.time+.25;
  const requested = Math.min(trackingEnd(), trackingHold?.target ?? frame.time + (paused ? 0 : .6),limit);
  const target = gallery ? { time: gallery.frameTimes?.[frameIndex(gallery.frameTimes,requested)] ?? requested, gallery: true } : buffer.at(requested);
  if (!target || target.time <= barPath.time + .00001) return;
  trackingWork=true;const token=session;
  const frames = gallery ? gallery.trackingFrames(barPath.time, target.time) : [...buffer.frames];
  barPath.through(frames,target.time).then(()=>{
    if(token!==session)return;
    lastFrame=null;
    if(barPath.lostAt!==null && reportedLoss!==barPath.lostAt) {
      reportedLoss=barPath.lostAt;
      if (playhead>=barPath.time-.01 || trackingHold) pauseAtReliablePoint();
      trackMessage('Tracking lost · last confirmed dot kept. Reselect the bar to continue.');
    } else if (trackingHold && barPath.time >= Math.min(trackingEnd(),trackingHold.target)-.00001) {
      trackingHold = null;
      if (gallery) { const clip=gallery; clip.play(speed).catch(e=>{if(gallery===clip&&e.name!=='AbortError')error('Could not resume this video. Tap Play to try again.');}); }
    }
  }).catch(()=>{if(token===session){barPath.cancel();barPath.lostAt=frame.time;reportedLoss=frame.time;pauseAtReliablePoint();trackMessage('Tracking unavailable · last confirmed dot kept. Reselect the bar.');}}).finally(()=>{trackingWork=false;});
}
function pauseAtReliablePoint() {
  trackingHold=null;manual();paused=true;playhead=Math.max(firstTime(),barPath.time);
  if (gallery) { gallery.pause();gallery.seek(playhead); }
}
function keepDotAligned() {
  if (selectingBar || paused || !barPath.tracker) return;
  if (barPath.lostAt!==null && playhead>barPath.time+.01) { pauseAtReliablePoint(); return; }
  if (!trackingHold && barPath.lostAt===null && playhead>barPath.time+.12) {
    trackingHold={target:Math.min(trackingEnd(),playhead+.4)};
    playhead=Math.max(firstTime(),barPath.time);
    if (gallery) { gallery.pause();gallery.seek(playhead); }
  }
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
  if (gallery) {
    const finishing = !paused && gallery.video.ended;
    playhead = gallery.time; paused = gallery.video.paused && !gallery.playPending && !trackingHold && !finishing;
    keepDotAligned();
    if (!trackingHold && gallery.video.paused && !gallery.playPending) paused = true;
    traceTo({ time: playhead, gallery: true });
    if (!gallery.video.seeking) drawGallery();
    controls(!loadingGallery && !starting && !gallery.video.error);
    $('trackBar').disabled ||= gallery.video.seeking || gallery.video.readyState < 2;
    for (const id of ['scrub','fsScrub']) { $(id).min = 0; $(id).max = gallery.duration; $(id).value = playhead; }
    $('position').textContent = $('fsPosition').textContent = `${fmt(playhead)} / ${fmt(gallery.duration)}`;
  } else if (buffer.frames.length) {
    if (follow && running && !trackingHold) playhead = delayedTime(seconds(),settings.delay,buffer.first);
    else if (!paused && !trackingHold && !(running && mode === 'record')) playhead = Math.min(buffer.last,playhead + dt * speed);
    playhead = Math.max(buffer.first,Math.min(buffer.last,playhead));
    keepDotAligned();
    if (!running && !trackingHold && playhead >= buffer.last) paused = true;
    if(!warming && !(running && mode === 'record')) { traceTo(buffer.at(playhead)); draw(buffer.at(playhead)); }
    controls(!warming && !(running && mode === 'record'));
    for (const id of ['scrub','fsScrub']) { $(id).min = buffer.first; $(id).max = buffer.last; $(id).value = playhead; }
    $('position').textContent = $('fsPosition').textContent = `${fmt(playhead-buffer.first)} / ${fmt(buffer.last-buffer.first)}`;
  }
  barPath.prune(firstTime());
  if(trackingHold && !selectingBar)trackMessage('Tracking catching up · holding the last confirmed dot.');
  else if(barPath.busy && !selectingBar)trackMessage('Tracing recorded frames…');
  else if(barPath.tracker && barPath.lostAt===null && !selectingBar)trackMessage('Experimental bar path');
  layout(warming);
  $('pause').textContent = $('fsPause').textContent = paused ? 'Play' : 'Pause';
  $('fsSpeed').value = String(speed);
  $('badge').textContent = loadingGallery ? 'LOADING VIDEO' : gallery ? 'GALLERY VIDEO' : running ? (mode === 'record' ? 'RECORDING' : warming ? 'LIVE · BUFFERING' : 'DELAYED REPLAY') : buffer.frames.length ? 'REVIEW' : 'CAMERA OFF';
  $('status').textContent = loadingGallery ? 'Opening gallery video…' : gallery ? gallery.video.seeking ? 'Seeking…' : paused ? 'Gallery video · paused' : `Gallery video · ${speed}×` : countdown !== null ? `Auto-replay in ${Math.max(1,Math.ceil((countdown-now)/1000))}s · review now to cancel` : running && mode === 'record' ? `Recording ${fmt(seconds())} · tap Stop to review` : warming ? `Delayed replay in ${Math.ceil(settings.delay-seconds())}s` : running && follow ? `${settings.delay}s behind camera` : buffer.frames.length ? paused ? 'Paused' : `Playing · ${speed}×` : 'Ready';
  $('reviewLabel').textContent = gallery ? 'Gallery video' : follow && running ? 'Delayed replay' : 'Review';
  $('storage').textContent = gallery ? `${gallery.file.name} · stays on this device` : mode === 'record' ? `${Math.ceil(buffer.bytes/1024/1024)} / 128 MiB · ${running ? 'Stop when finished' : 'Clip clears on Record next or reload'}` : `${Math.round(buffer.last-buffer.first)}s / up to 90s rolling review${buffer.thinned ? ' · reduced replay frame rate' : ''}`;
  updateFrameControls();
  if (tvMode) {
    if ((tvHiddenBy === 'auto' && paused) || selectingBar || trackingHold || !$('error').hidden) showTVControls(false);
    const playing = !paused && !selectingBar && !trackingHold;
    if (playing && !tvWasPlaying && !tvHiddenBy) showTVControls();
    tvWasPlaying = playing;
  }
  requestAnimationFrame(tick);
}
$('trackBar').onclick = () => {
  manual();paused=true;gallery?.pause();barPath.cancel();selectingBar=true;
  // Anchor selection to the frame actually visible, not an undrawn next tick.
  if(lastFrame) { playhead=lastFrame.time; if (gallery) gallery.seek(playhead); }
  $('replay').classList.add('select-bar');$('clearTrack').hidden=false;
  draftPoint=null;
  trackMessage('Pinch to zoom. Touch and adjust the dot on the bar end; release to set it.');
};
$('clearTrack').onclick = clearTracking;
function pointAt(screen) {
  const frame=lastFrame ?? draftPoint?.frame;
  if (!frame) return null;
  const canvas=$('replay'), point=videoPoint(screen.x,screen.y,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  return point ? { frame, x:point.x/canvas.width,y:point.y/canvas.height } : null;
}
async function selectBarAt(screen) {
  if(!selectingBar)return;
  const point=pointAt(screen); if(!point)return;
  try {
    if(await barPath.select(point.frame,point.x,point.y)) {
      selectingBar=false;draftPoint=null;reportedLoss=null;lastFrame=null;$('replay').classList.remove('select-bar');$('trackBar').textContent='Reselect bar';
      trackMessage('Bar selected · play or scrub to trace');
    }
  } catch(e) {trackMessage(e.message);}
}
$('start').onclick = $('screenStart').onclick = start; $('stop').onclick = () => stop(); $('screenStop').onclick = () => stop();
$('openGallery').onclick = $('screenGallery').onclick = openGallery;
$('galleryFile').onchange = () => loadGallery($('galleryFile').files[0]);
$('captureMode').onchange = () => { mode = $('captureMode').value; countdown = null; $('delayTitle').textContent = mode === 'record' ? 'Replay after Stop' : 'Replay delay'; $('start').textContent = mode === 'record' ? (buffer.frames.length ? 'Record next' : 'Start recording') : 'Start camera'; layout(); };
$('delay').oninput = () => { settings.delay = Math.max(5,Math.min(30,Number($('delay').value))); $('delayValue').textContent = `${settings.delay}s`; persist(); };
$('facing').onchange = () => { settings.facing = $('facing').value; persist(); };
function scrub(value) { paused = true; gallery?.pause(); seek(snapFrame(frameTimes(), value), true); }
for(const id of ['scrub','fsScrub']) $(id).oninput=()=>{
  // Chrome can still emit native touch-slider input after a prevented pointer
  // move. The captured gesture owns the value until release; don't let native
  // whole-clip positioning override an individual frame jog.
  if(scrubDrag) { $(id).value=playhead;return; }
  scrub(Number($(id).value));
};
for (const prefix of ['', 'fs']) {
  const id = name => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
  $(id('prevFrame')).onclick = () => scrub(adjacentFrame(frameTimes(), playhead, -1));
  $(id('nextFrame')).onclick = () => scrub(adjacentFrame(frameTimes(), playhead, 1));
  $(id('fineScrub')).onclick = () => { settings.fineScrub = !settings.fineScrub; persist(); updateFrameControls(); };
  $(id('fineScrub')).title='Slide the timeline to step frames. Pull down while dragging for finer control.';
}
// Fine scrubbing advances one real frame per 3px, independent of clip length.
// Overview maps the whole timeline, but still snaps to presentation timestamps.
let scrubDrag = null;
function dragScrub(event) {
  if (!scrubDrag || event.pointerId !== scrubDrag.id) return;
  event.preventDefault(); event.stopPropagation();
  if (scrubDrag.fine && scrubDrag.times.length) {
    const index = scrubDrag.jog.move(event.clientX,event.clientY);
    scrub(scrubDrag.times[index]);
  } else {
    const rect = scrubDrag.element.getBoundingClientRect();
    const fraction = Math.max(0,Math.min(1,(event.clientX-rect.left-10)/Math.max(1,rect.width-20)));
    scrub(scrubDrag.first + fraction * (scrubDrag.last-scrubDrag.first));
  }
}
for (const id of ['scrub','fsScrub']) {
  const element = $(id);
  element.onpointerdown = event => {
    if (element.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (scrubDrag && scrubDrag.id !== event.pointerId) return;
    const times = frameTimes();
    scrubDrag = { id:event.pointerId, element, first:firstTime(), last:lastTime(), times, jog:new FrameJog(frameIndex(times,playhead),times.length,event.clientX,event.clientY), fine:settings.fineScrub };
    element.focus(); element.setPointerCapture(event.pointerId); dragScrub(event);
  };
  element.onpointermove = dragScrub;
  element.onpointerup = event => {
    if (scrubDrag?.id !== event.pointerId) return;
    dragScrub(event); scrubDrag = null;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  element.onpointercancel = element.onlostpointercapture = () => { scrubDrag = null; };
  element.onkeydown = event => {
    const times = frameTimes();
    if (!times.length) return;
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      scrub(event.key==='Home' ? times[0] : event.key==='End' ? times.at(-1) : adjacentFrame(times,playhead,event.key==='ArrowLeft'?-1:1));
    }
  };
}

$('back').onclick = () => seek(playhead-5); $('forward').onclick = () => seek(playhead+5);
$('pause').onclick = async () => {
  if (trackingHold) { manual(); paused=true;gallery?.pause();barPath.cancel();return; }
  manual();
  if (gallery) {
    const clip = gallery;
    if (!clip.video.paused || clip.playPending) { clip.pause(); paused = true; return; }
    if (playhead >= clip.duration - 0.01) clip.seek(0);
    try { await clip.play(speed); } catch (e) { if (gallery === clip && e.name !== 'AbortError') error('Could not play this video. Try an H.264 MP4 file in Chrome.'); }
    return;
  }
  if(paused && playhead >= buffer.last) playhead = buffer.first; paused = !paused;
};
$('speed').onchange = () => { speed = Number($('speed').value); manual(false); if (gallery) gallery.video.playbackRate = speed; };
$('live').onclick = () => { if (running && mode === 'running') { trackingHold=null;follow = true; paused = false; speed = 1; $('speed').value = '1'; } };
$('fsPause').onclick = () => $('pause').click();
$('fsSpeed').onchange = () => { $('speed').value = $('fsSpeed').value; $('speed').onchange(); };
$('fsLive').onclick = () => $('live').click();
document.addEventListener('fullscreenchange',() => {
  scrubDrag = null;
  if (!document.fullscreenElement && tvMode) leaveTVView();
  $('fullscreen').textContent = document.fullscreenElement === $('viewer') ? 'Exit full screen' : 'Full screen';
});
$('fullscreen').onclick = async () => { try { if(document.fullscreenElement) await document.exitFullscreen(); else await $('viewer').requestFullscreen(); } catch { error('Full screen is unavailable. Rotate the phone for a larger replay.'); } };
$('tvHelp').onclick = () => $('help').showModal(); $('closeHelp').onclick = () => $('help').close();
$('closeInstall').onclick = () => $('installHelp').close();
document.addEventListener('visibilitychange',()=>{ if(document.hidden) { manual();gallery?.pause(); barPath.cancel(); } if(document.hidden && (running || starting)) { stop(false); error('Capture stopped because the app went into the background. Retained footage is ready to review.'); } else if(document.hidden) { countdown = null; paused = true; } });
window.addEventListener('pagehide',() => { barPath.cancel(); stop(false); pendingGallery?.close(); pendingGallery = null; loadingGallery = false; });
requestAnimationFrame(tick);
let installPrompt;
let installed = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
const installButton=$('install');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installed=true;installPrompt=null; });
installButton.onclick = async () => {
  if(installed || !installPrompt) { $('installHelp').showModal();return; }
  const prompt=installPrompt;installPrompt=null;installButton.disabled=true;
  try {
    await prompt.prompt();
    if((await prompt.userChoice).outcome==='accepted')installed=true;
  } catch { $('installHelp').showModal(); }
  finally { installButton.disabled=false; }
};
