// Presentation timestamps, rather than an assumed frame rate, define a frame.
export function frameIndex(times, time) {
  if (!times.length) return -1;
  let low = 0, high = times.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (times[mid] <= time + 0.00001) low = mid; else high = mid - 1;
  }
  return low;
}
export function snapFrame(times, time) {
  if (!times.length) return time;
  const index = frameIndex(times, time), next = times[index + 1];
  return next !== undefined && Math.abs(next - time) < Math.abs(times[index] - time) ? next : times[index];
}
export function adjacentFrame(times, time, direction) {
  if (!times.length) return time;
  const index = Math.max(0, Math.min(times.length - 1, frameIndex(times, time) + direction));
  return times[index];
}

export async function videoFrameTimes(file, duration, signal) {
  // Metadata-only demuxing does not decode or retain the video frame payloads.
  const { Input, BlobSource, EncodedPacketSink, MP4, QTFF, WEBM } = await import('mediabunny');
  if (signal.aborted) throw new Error('Video closed.');
  const input = new Input({ source: new BlobSource(file, { maxCacheSize: 2 * 1024 * 1024 }), formats: [MP4, QTFF, WEBM] });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const times = [];
    for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
      if (signal.aborted) throw new Error('Video closed.');
      if ((packet.timestamp >= 0 || packet.timestamp + packet.duration > 0) && packet.timestamp < duration) times.push(Math.max(0, packet.timestamp));
      // Bound the index on extremely long/high-rate files; time review remains
      // available if exact indexing cannot be supplied within this limit.
      if (times.length > 2000000) return null;
    }
    times.sort((a, b) => a - b);
    const unique = times.filter((time, i) => i === 0 || time - times[i - 1] > .000001);
    return unique.length ? Float64Array.from(unique) : null;
  } finally { signal.removeEventListener('abort', dispose); input.dispose(); }
}
