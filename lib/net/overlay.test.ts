import { describe, expect, it } from "vitest";
import {
  CURSOR_BYTES,
  CURSOR_PRESSED,
  CURSOR_VISIBLE,
  decodeCursor,
  decodeInk,
  encodeCursor,
  encodeInk,
  INK_MAX_POINTS,
  stampPeer,
  type Cursor,
} from "./overlay";

describe("cursor packet", () => {
  it("round-trips within u16 precision and clamps off-frame points", () => {
    const view = new DataView(new ArrayBuffer(CURSOR_BYTES));
    encodeCursor({ peer: 3, x: 0.25, y: 1.5, flags: CURSOR_VISIBLE | CURSOR_PRESSED }, view);
    const got: Cursor = { peer: 0, x: 0, y: 0, flags: 0 };
    decodeCursor(view, got);
    expect(got.peer).toBe(3);
    expect(got.x).toBeCloseTo(0.25, 4);
    expect(got.y).toBe(1);
    expect(got.flags).toBe(CURSOR_VISIBLE | CURSOR_PRESSED);
  });
});

describe("ink packet", () => {
  it("round-trips points and lets the host restamp the peer", () => {
    const buf = encodeInk(0, 70000, [0, 0.5, 1, 0.125], 2);
    stampPeer(buf, 9);
    const { peer, stroke, points } = decodeInk(new DataView(buf));
    expect(peer).toBe(9);
    expect(stroke).toBe(70000 & 0xffff);
    expect(Array.from(points).map((v) => +v.toFixed(3))).toEqual([0, 0.5, 1, 0.125]);
  });

  it("caps points per packet", () => {
    const many = new Array((INK_MAX_POINTS + 10) * 2).fill(0.5);
    expect(decodeInk(new DataView(encodeInk(0, 1, many, INK_MAX_POINTS + 10))).points.length).toBe(INK_MAX_POINTS * 2);
  });
});
