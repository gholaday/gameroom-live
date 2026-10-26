// Overlay wire formats: pointer hands and ink drawn over the game.
// Coordinates are normalized to the game frame (0..65535 on each axis), so
// every viewer maps them onto their own display size.
//
// Cursor channel (unordered, no retransmits; newest wins), 7 bytes:
//   peer u8, x u16, y u16, flags u8, pad u8
// Ink channel (reliable, ordered):
//   peer u8, stroke u16, count u8, then count x (x u16, y u16)
// Senders write peer 0; the host stamps the real peer id when relaying.

export const CURSOR_BYTES = 7;
export const CURSOR_VISIBLE = 1;
export const CURSOR_PRESSED = 2;
/** Points per ink packet; a pointer move rarely yields more than a few. */
export const INK_MAX_POINTS = 64;
export const HOST_PEER = 0;

const toU16 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 65535);
const fromU16 = (v: number) => v / 65535;

export type Cursor = { peer: number; x: number; y: number; flags: number };

export function encodeCursor(c: Cursor, out: DataView) {
  out.setUint8(0, c.peer);
  out.setUint16(1, toU16(c.x));
  out.setUint16(3, toU16(c.y));
  out.setUint8(5, c.flags);
  out.setUint8(6, 0);
}

export function decodeCursor(view: DataView, into: Cursor) {
  into.peer = view.getUint8(0);
  into.x = fromU16(view.getUint16(1));
  into.y = fromU16(view.getUint16(3));
  into.flags = view.getUint8(5);
}

/** points is flat [x0, y0, x1, y1, ...] in 0..1. */
export function encodeInk(peer: number, stroke: number, points: ArrayLike<number>, count: number): ArrayBuffer {
  const n = Math.min(count, INK_MAX_POINTS);
  const view = new DataView(new ArrayBuffer(4 + n * 4));
  view.setUint8(0, peer);
  view.setUint16(1, stroke & 0xffff);
  view.setUint8(3, n);
  for (let i = 0; i < n; i++) {
    view.setUint16(4 + i * 4, toU16(points[i * 2]));
    view.setUint16(6 + i * 4, toU16(points[i * 2 + 1]));
  }
  return view.buffer;
}

export function decodeInk(view: DataView): { peer: number; stroke: number; points: Float32Array } {
  const n = view.getUint8(3);
  const points = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    points[i * 2] = fromU16(view.getUint16(4 + i * 4));
    points[i * 2 + 1] = fromU16(view.getUint16(6 + i * 4));
  }
  return { peer: view.getUint8(0), stroke: view.getUint16(1), points };
}

/** The host rewrites the sender's peer id in place before relaying. */
export function stampPeer(buf: ArrayBuffer, peer: number) {
  new DataView(buf).setUint8(0, peer);
}
