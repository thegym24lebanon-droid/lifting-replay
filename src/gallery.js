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

export function analysisFrames(from, to, interval = 1 / 15, times = null) {
  return (function* () {
    if (times?.length) {
      for (let i=frameIndex(times,from)+1;i<times.length && times[i]<=to+.00001;i++) yield {time:times[i],gallery:true};
      return;
    }
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
    this.pendingSeek=null; this.requestedTime=null; this.seekScheduled=null; this.playGeneration=0;this.playPending=false;
    this.video.addEventListener('seeked', () => {
      if (this.pendingSeek!==null) this.scheduleSeek(); else this.finishSeek();
    });
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
  get time() { return this.requestedTime ?? this.video.currentTime; }
  seek(time) {
    const target=Math.max(0,Math.min(this.duration,time));
    if (Math.abs(target-this.time)<.00001) return;
    this.pendingSeek=this.requestedTime=target; this.scheduleSeek();
  }
  scheduleSeek() {
    if (this.seekScheduled!==null || this.video.seeking || this.controller.signal.aborted) return;
    this.seekScheduled=requestAnimationFrame(() => {
      this.seekScheduled=null;
      if (this.controller.signal.aborted || this.video.seeking) return;
      const target=this.pendingSeek; this.pendingSeek=null;
      if (target===null || Math.abs(target-this.video.currentTime)<.00001) this.finishSeek();
      else this.video.currentTime=target;
    });
  }
  finishSeek() { this.requestedTime=null; this.video.dispatchEvent(new Event('replayseeked')); }
  async play(speed) {
    const token=++this.playGeneration;this.playPending=true;
    try {
      await ready(this.video,'replayseeked',()=>!this.video.seeking && this.pendingSeek===null && this.seekScheduled===null,this.controller.signal);
      if(token!==this.playGeneration)return;
      this.video.playbackRate=speed; return await this.video.play();
    } finally {if(token===this.playGeneration)this.playPending=false;}
  }
  pause() { ++this.playGeneration;this.playPending=false;this.video.pause(); }
  seekFrame(time) {
    if (!this.frameTimes) { this.seek(time); return; }
    const index = frameIndex(this.frameTimes, time), start = this.frameTimes[index];
    const end = this.frameTimes[index + 1] ?? this.duration;
    // Seek inside the frame's interval to avoid boundary rounding selecting the
    // preceding frame on native mobile video decoders.
    this.seek(start + Math.min(.0001, Math.max(0, end - start) / 4));
  }
  async sampleSink() {
    if (this.sinkPromise) return this.sinkPromise;
    this.sinkPromise=(async()=>{
      if (typeof VideoDecoder==='undefined' || !this.frameTimes) return null;
      const {Input,BlobSource,VideoSampleSink,MP4,QTFF,WEBM}=await import('mediabunny');
      if (this.controller.signal.aborted) throw new Error('Video closed.');
      const input=new Input({source:new BlobSource(this.file,{maxCacheSize:2*1024*1024}),formats:[MP4,QTFF,WEBM]});
      this.sampleInput=input;
      const track=await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) { input.dispose();this.sampleInput=null;return null; }
      return new VideoSampleSink(track);
    })().catch(e=>{this.sampleInput?.dispose();this.sampleInput=null;if(this.controller.signal.aborted)throw e;return null;});
    return this.sinkPromise;
  }
  gray(draw,width,height) {
    this.canvas.width=Math.min(640,width); this.canvas.height=Math.round(height*this.canvas.width/width);
    draw(this.context,this.canvas.width,this.canvas.height);
    const rgba=this.context.getImageData(0,0,this.canvas.width,this.canvas.height).data;
    const data=new Uint8Array(this.canvas.width*this.canvas.height);
    for(let i=0;i<data.length;i++)data[i]=(rgba[i*4]*77+rgba[i*4+1]*150+rgba[i*4+2]*29)>>8;
    return {data,width:this.canvas.width,height:this.canvas.height};
  }
  async *trackingFrames(from,to) {
    let completed=from;
    const sink=await this.sampleSink();
    if (sink) {
      try {
        for await(const sample of sink.samples(from,to+.00001)) {
          let frame;
          try {
            if (this.controller.signal.aborted) throw new Error('Video closed.');
            if (sample.timestamp>from+.00001 && sample.timestamp<=to+.00001) {
              frame={time:sample.timestamp,gallery:true,image:this.gray((ctx,w,h)=>sample.draw(ctx,0,0,w,h),sample.displayWidth,sample.displayHeight)};
            }
          } finally { sample.close(); }
          if(frame) {completed=frame.time;yield frame;}
        }
        return;
      } catch(e) {
        if(this.controller.signal.aborted) throw e;
        // Native video may support a codec that WebCodecs cannot handle.
        this.sampleInput?.dispose();this.sampleInput=null;this.sinkPromise=Promise.resolve(null);
      }
    }
    for(const frame of analysisFrames(completed,to,1/15,this.frameTimes)) yield frame;
  }
  read(time) {
    // Selection and an earlier cancelled trace may overlap; serialize decoder
    // seeks so each point is computed from its own requested video frame.
    const work = this.queue.then(async () => {
      if (this.controller.signal.aborted) throw new Error('Video closed.');
      const index=this.frameTimes ? frameIndex(this.frameTimes,time) : -1;
      const start=index>=0?this.frameTimes[index]:time,end=this.frameTimes?.[index+1]??this.duration;
      const target = Math.max(0, Math.min(this.duration - 0.000001, start+Math.min(.0001,Math.max(0,end-start)/4)));
      if (Math.abs(this.decoder.currentTime - target) > 0.0001) this.decoder.currentTime = target;
      await ready(this.decoder, 'seeked', () => !this.decoder.seeking && this.decoder.readyState >= 2, this.controller.signal);
      return this.gray((ctx,w,h)=>ctx.drawImage(this.decoder,0,0,w,h),this.decoder.videoWidth,this.decoder.videoHeight);
    });
    this.queue = work.catch(() => {});
    return work;
  }
  close() {
    this.pause();
    this.controller.abort();
    if(this.seekScheduled!==null)cancelAnimationFrame(this.seekScheduled);
    this.pendingSeek=this.requestedTime=this.seekScheduled=null;
    this.sampleInput?.dispose(); this.sampleInput=null;
    for (const video of [this.video, this.decoder]) { video.pause(); video.removeAttribute('src'); video.load(); }
    URL.revokeObjectURL(this.url);
  }
}
