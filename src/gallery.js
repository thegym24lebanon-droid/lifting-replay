// The selected file stays on the device. Native video decoding avoids expanding
// an entire gallery clip into the camera's bounded JPEG buffer.
import { videoFrameTimes, frameIndex } from './frames.js';
function ready(video, event, predicate, signal) {
  if (signal.aborted) return Promise.reject(new Error('Video closed.'));
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); video.removeEventListener(event, check);
      video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);
    };
    const check = () => { if (predicate()) { cleanup(); resolve(); } };
    const failed = () => { cleanup(); reject(new Error('This browser cannot decode that video. Try an H.264 MP4 file.')); };
    const aborted = () => { cleanup(); reject(new Error('Video closed.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('The video took too long to decode. Try a smaller H.264 MP4 file.')); }, 20000);
    video.addEventListener(event, check); video.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true }); check();
  });
}

export function analysisFrames(from, to, interval = 1 / 15) {
  return (function* () {
    for (let time = from + interval; time < to - 0.00001; time += interval) yield { time, gallery: true };
    if (to > from + 0.00001) yield { time: to, gallery: true };
  })();
}

export class GalleryClip {
  constructor(file) {
    this.file = file; this.url = URL.createObjectURL(file); this.controller = new AbortController();
    this.video = this.media(); this.decoder = this.media(); this.queue = Promise.resolve();
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
  }
  media() {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = this.url;
    return video;
  }
  get duration() { return this.video.duration; }
  async load() {
    await Promise.all([this.video, this.decoder].map(video => ready(video, 'loadeddata', () => video.readyState >= 2, this.controller.signal)));
    if (!Number.isFinite(this.duration) || this.duration <= 0 || !this.video.videoWidth) throw new Error('This file has no playable video track. Choose another video.');
    try { this.frameTimes = await videoFrameTimes(this.file, this.duration, this.controller.signal); }
    catch (e) { if (this.controller.signal.aborted) throw e; this.frameTimes = null; }
    return this;
  }
  seek(time) { this.video.currentTime = Math.max(0, Math.min(this.duration, time)); }
  play(speed) { this.video.playbackRate = speed; return this.video.play(); }
  pause() { this.video.pause(); }
  seekFrame(time) {
    if (!this.frameTimes) { this.seek(time); return; }
    const index = frameIndex(this.frameTimes, time), start = this.frameTimes[index];
    const end = this.frameTimes[index + 1] ?? this.duration;
    // Seek inside the frame's interval to avoid boundary rounding selecting the
    // preceding frame on native mobile video decoders.
    this.seek(start + Math.min(.0001, Math.max(0, end - start) / 4));
  }
  read(time) {
    // Selection and an earlier cancelled trace may overlap; serialize decoder
    // seeks so each point is computed from its own requested video frame.
    const work = this.queue.then(async () => {
      if (this.controller.signal.aborted) throw new Error('Video closed.');
      const target = Math.max(0, Math.min(this.duration - 0.001, time));
      if (Math.abs(this.decoder.currentTime - target) > 0.0001) this.decoder.currentTime = target;
      await ready(this.decoder, 'seeked', () => !this.decoder.seeking && this.decoder.readyState >= 2, this.controller.signal);
      this.canvas.width = Math.min(640, this.decoder.videoWidth);
      this.canvas.height = Math.round(this.decoder.videoHeight * this.canvas.width / this.decoder.videoWidth);
      this.context.drawImage(this.decoder, 0, 0, this.canvas.width, this.canvas.height);
      const rgba = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      const data = new Uint8Array(this.canvas.width * this.canvas.height);
      for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
      return { data, width: this.canvas.width, height: this.canvas.height };
    });
    this.queue = work.catch(() => {});
    return work;
  }
  close() {
    this.controller.abort();
    for (const video of [this.video, this.decoder]) { video.pause(); video.removeAttribute('src'); video.load(); }
    URL.revokeObjectURL(this.url);
  }
}
