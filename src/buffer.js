export class ReplayBuffer {
  constructor(seconds = 90, maxBytes = 64 * 1024 * 1024) { this.seconds = seconds; this.maxBytes = maxBytes; this.frames = []; this.bytes = 0; this.retainAll = false; this.thinned = false; }
  add(time, blob) {
    if (this.retainAll && this.bytes + blob.size > this.maxBytes) return false;
    // A single over-budget frame is skipped in rolling mode, never a capture stop.
    if (!this.retainAll && blob.size > this.maxBytes) { this.thinned = true; return true; }
    this.frames.push({time, blob}); this.bytes += blob.size;
    while (this.frames.length > 1 && time - this.frames[0].time > this.seconds) this.bytes -= this.frames.shift().blob.size;
    // Under byte pressure, thin the densest part of the timeline, preserving
    // its endpoints so the selected delay survives instead of stopping capture.
    while (this.bytes > this.maxBytes) {
      let remove = 0;
      if (this.frames.length > 2) {
        let smallestGap = Infinity;
        for (let i = 1; i < this.frames.length - 1; i++) {
          const gap = this.frames[i+1].time - this.frames[i-1].time;
          if (gap < smallestGap) { smallestGap = gap; remove = i; }
        }
      }
      this.bytes -= this.frames.splice(remove,1)[0].blob.size;
      this.thinned = true;
    }
    return true;
  }
  at(time) {
    let low = 0, high = this.frames.length - 1;
    if (high < 0) return null;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (this.frames[mid].time <= time) low = mid; else high = mid - 1; }
    return this.frames[low];
  }
  get first() { return this.frames[0]?.time ?? 0; }
  get last() { return this.frames.at(-1)?.time ?? 0; }
  clear() { this.frames = []; this.bytes = 0; this.thinned = false; }
}
export function delayedTime(now, delay, first) { return Math.max(first, now - delay); }
