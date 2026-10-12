import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'lifting-gallery-'));
const clip = join(folder, 'test-lift.mp4'), longClip = join(folder, 'long-lift.mp4'), portrait = join(folder, 'portrait.mp4');
const raw = Buffer.alloc(480 * 270 * 3 * 60, 32);
for (let frame = 0; frame < 60; frame++) {
  const time = frame / 15, x = Math.round(100 + 15 * time), y = Math.round(170 - 40 * Math.sin(time * .8));
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const v = 70 + ((dx * dx * 11 + dy * dy * 7 + dx * dy * 19 + 1000) % 180);
    const index = (frame * 480 * 270 + (y + dy) * 480 + x + dx) * 3;
    raw.fill(v, index, index + 3);
  }
}
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '480x270', '-framerate', '15', '-i', 'pipe:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', clip], { input: raw });
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', clip, '-t', '95', '-c', 'copy', longClip]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=270x480:rate=15', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', portrait]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], hasTouch: true });
  const page = await context.newPage(), errors = [], uploads = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() !== 'GET') uploads.push(r.method()); });
  await page.goto(process.env.APP_URL || 'http://localhost:5173');
  await page.locator('#delay').fill('5'); await page.locator('#delay').dispatchEvent('input');
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.locator('#screenStart').isVisible(), true);
  await page.locator('#screenStart').click(); await page.waitForFunction(() => document.getElementById('badge').textContent.includes('BUFFERING'));
  assert.equal(await page.locator('#screenStart').isVisible(), false); assert.equal(await page.locator('#screenStop').isVisible(), true);
  await page.locator('#screenStop').click(); await page.waitForFunction(() => !document.getElementById('screenStart').hidden);
  await page.locator('#screenStart').click(); await page.waitForFunction(() => document.getElementById('badge').textContent.includes('BUFFERING'));
  // A successful gallery import stops the camera and does not upload footage.
  const chooser = page.waitForEvent('filechooser'); await page.locator('#screenGallery').click(); await (await chooser).setFiles(clip);
  await page.waitForFunction(() => document.getElementById('badge').textContent === 'GALLERY VIDEO');
  assert.equal(await page.evaluate(() => document.getElementById('camera').srcObject), null);
  assert.equal(await page.locator('#screenStart').isVisible(), true);
  await page.waitForFunction(() => document.getElementById('replay').width === 480);
  assert.ok(Number(await page.locator('#fsScrub').getAttribute('max')) >= 3.9);
  assert.equal(await page.locator('#fsLive').isVisible(), false);
  const canvasPixels = () => page.evaluate(() => { const c = document.getElementById('replay'); return c.getContext('2d').getImageData(100, 170, 1, 1).data[0]; });
  assert.ok(await canvasPixels() > 40, 'decoded local video frame is rendered');
  await page.locator('#fsSpeed').selectOption('0.25'); await page.locator('#fsPause').click(); await page.waitForTimeout(800);
  const slowTime = Number(await page.locator('#fsScrub').inputValue()); assert.ok(slowTime > .08 && slowTime < .4, `native quarter-speed playback: ${slowTime}`);
  await page.locator('#fsPause').click(); const paused = Number(await page.locator('#fsScrub').inputValue()); await page.waitForTimeout(150);
  assert.ok(Math.abs(Number(await page.locator('#fsScrub').inputValue()) - paused) < .02);
  const seek = async fraction => {
    const r = await page.locator('#fsScrub').boundingBox();
    await page.touchscreen.tap(r.x + 10 + (r.width - 20) * fraction, r.y + r.height / 2);
    await page.waitForTimeout(150);
  };
  await page.locator('#fsFineScrub').click(); // Whole-timeline seeks use Overview.
  await seek(.75); assert.ok(Number(await page.locator('#fsScrub').inputValue()) > 2.5);
  await seek(.1); assert.ok(Number(await page.locator('#fsScrub').inputValue()) < .6);
  await page.locator('#fsScrub').press('Home'); await page.waitForTimeout(150);
  await page.locator('#trackBar').click();
  const target = await page.evaluate(() => {
    const c = document.getElementById('replay'), r = c.getBoundingClientRect(), scale = Math.min(r.width / 480, r.height / 270);
    return { x: r.left + (r.width - 480 * scale) / 2 + 100 * scale, y: r.top + (r.height - 270 * scale) / 2 + 170 * scale };
  });
  await page.touchscreen.tap(target.x, target.y);
  await page.waitForFunction(() => document.getElementById('trackBar').textContent === 'Reselect bar');
  await seek(.9);
  await page.waitForFunction(() => document.getElementById('trackStatus').textContent === 'Experimental bar path', {}, { timeout: 15000 });
  const cyan = () => page.evaluate(() => { const c = document.getElementById('replay'), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 30 && data[i+1] > 180 && data[i+2] > 180) count++; return count; });
  const line = await cyan(); assert.ok(line > 70, 'gallery video movement line computed');
  await seek(.1); assert.ok(await cyan() > line * .8, 'movement line persists through rewinding');
  await page.screenshot({ path: '/tmp/lifting-gallery-portrait.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(150);
  const range = await page.locator('#fsScrub').boundingBox(); assert.ok(range.y + range.height <= 390);
  await page.screenshot({ path: '/tmp/lifting-gallery-landscape.png' });
  await page.locator('#clearTrack').click(); await page.waitForTimeout(100); assert.equal(await cyan(), 0);
  // Decode errors and invalid file choices preserve the existing gallery clip.
  await page.locator('#galleryFile').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid video') });
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('cannot decode'));
  assert.equal(await page.locator('#screenError').isVisible(), true); assert.match(await page.locator('#storage').textContent(), /test-lift.mp4/);
  await page.locator('#galleryFile').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not a video') });
  assert.match(await page.locator('#error').textContent(), /Choose a video/);
  await page.locator('#galleryFile').setInputFiles([]); assert.match(await page.locator('#storage').textContent(), /test-lift.mp4/);
  // A gallery file is not truncated by the camera's rolling 90 second buffer.
  await page.locator('#galleryFile').setInputFiles(longClip); await page.waitForFunction(() => Number(document.getElementById('fsScrub').max) > 94);
  await seek(.97); assert.ok(Number(await page.locator('#fsScrub').inputValue()) > 90);
  await page.locator('#galleryFile').setInputFiles(portrait); await page.waitForFunction(() => document.getElementById('replay').height === 480 && document.getElementById('replay').width === 270);
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await page.locator('#openGallery').isVisible(), true); assert.equal(await page.locator('#start').textContent(), 'Turn camera on');
  await page.locator('#fullscreen').click(); await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.getElementById('badge').textContent.includes('BUFFERING'));
  assert.equal(await page.locator('#screenStop').isVisible(), true); assert.equal(await page.locator('#clearTrack').isVisible(), false);
  await page.locator('#screenStop').click();
  assert.deepEqual(errors, []); assert.deepEqual(uploads, []);
  await context.close();
  const denied = await browser.newContext(); const p = await denied.newPage();
  await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await p.goto(process.env.APP_URL || 'http://localhost:5173'); await p.locator('#fullscreen').click(); await p.locator('#screenStart').click();
  await p.waitForFunction(() => document.getElementById('screenError').textContent.includes('permission was denied'));
  assert.equal(await p.locator('#screenError').isVisible(), true); assert.equal(await p.locator('#screenStart').isEnabled(), true);
  await p.locator('#galleryFile').setInputFiles(clip); await p.waitForFunction(() => document.getElementById('badge').textContent === 'GALLERY VIDEO');
  await p.locator('#screenStart').click(); await p.waitForFunction(() => document.getElementById('screenError').textContent.includes('permission was denied'));
  assert.match(await p.locator('#storage').textContent(), /test-lift.mp4/, 'failed camera start preserves gallery video');
  await denied.close();
  console.log('PASS: full-screen camera on/off/restart and permission errors; real local MP4 decoding; full-screen gallery chooser; play/pause; measured slow motion; touch scrubbing; movement line and rewind; portrait/landscape; invalid/cancelled/replaced files; full 95s video; return to camera; failed camera start retains video; no uploads or browser errors.');
} finally { await browser.close(); rmSync(folder, { recursive: true, force: true }); }
