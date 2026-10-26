import { describe, expect, it } from "vitest";
import { estimateLatency, perFrameMs } from "./latency";

describe("estimateLatency", () => {
  it("sums one RTT, one frame of waiting, and the pipeline stages", () => {
    const e = estimateLatency({ rttMs: 30, encodeMs: 4, bufferMs: 2, decodeMs: 3, frameMs: 1000 / 60 });
    expect(e).toEqual({ network: 30, frames: 17, encode: 4, buffer: 2, decode: 3, total: 56 });
  });
});

describe("perFrameMs", () => {
  it("averages a cumulative seconds counter over the frames between samples", () => {
    expect(perFrameMs(1.5, 160, 1.2, 100)).toBeCloseTo(5);
    expect(perFrameMs(1, 100, 1, 100)).toBe(0);
  });
});
