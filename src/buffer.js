export class ReplayBuffer {
  constructor(seconds = 90, maxBytes = 64 * 1024 * 1024) { this.seconds = seconds; this.maxBytes = maxBytes; this.frames = []; this.bytes = 0; }
  add(time, blob) {
    this.frames.push({time, blob}); this.bytes += blob.size;
    while (this.frames.length > 1 && (time - this.frames[0].time > this.seconds || this.bytes > this.maxBytes)) this.bytes -= this.frames.shift().blob.size;
  }
  at(time) {
    let low = 0, high = this.frames.length - 1;
    if (high < 0) return null;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (this.frames[mid].time <= time) low = mid; else high = mid - 1; }
    return this.frames[low];
  }
  get first() { return this.frames[0]?.time ?? 0; }
  get last() { return this.frames.at(-1)?.time ?? 0; }
  clear() { this.frames = []; this.bytes = 0; }
}
export function delayedTime(now, delay, first) { return Math.max(first, now - delay); }
