/** Input-to-photon estimate for a guest, from measured parts. All in ms. */
export type LatencyParts = {
  rttMs: number;
  /** Host encode time per frame (sent by the host). */
  encodeMs: number;
  /** Guest jitter buffer delay per frame. */
  bufferMs: number;
  /** Guest decode time per frame. */
  decodeMs: number;
  /** Emulator frame time, 1000 / 60 for NTSC. */
  frameMs: number;
};

export type LatencyEstimate = {
  network: number;
  frames: number;
  encode: number;
  buffer: number;
  decode: number;
  total: number;
};

/**
 * Input travels half the RTT to the host, waits on average half a frame for
 * the next emulated frame, gets encoded, travels the other half back, sits in
 * the jitter buffer, decodes, and waits on average half a frame for display.
 */
export function estimateLatency(p: LatencyParts): LatencyEstimate {
  const network = p.rttMs;
  const frames = p.frameMs;
  const total = network + frames + p.encodeMs + p.bufferMs + p.decodeMs;
  const r = (v: number) => Math.round(v);
  return {
    network: r(network),
    frames: r(frames),
    encode: r(p.encodeMs),
    buffer: r(p.bufferMs),
    decode: r(p.decodeMs),
    total: r(total),
  };
}

/** Per-frame average of a cumulative stat between two samples (e.g. totalDecodeTime / framesDecoded). */
export function perFrameMs(totalSecNow: number, framesNow: number, totalSecPrev: number, framesPrev: number) {
  const frames = framesNow - framesPrev;
  return frames > 0 ? ((totalSecNow - totalSecPrev) * 1000) / frames : 0;
}
