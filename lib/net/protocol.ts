// Wire formats shared by host and guest. See design doc section 6.
//
// Input channel (unordered, no retransmits), binary:
//   8 bytes  input: seq u16, buttons u16, lx i8, ly i8, rx i8, ry i8
//   9 bytes  ping or pong: kind u8, sender's timestamp f64 (ms)
// Control channel (reliable, JSON): ControlMessage below.

/** RetroPad bit order, matching libretro's RETRO_DEVICE_ID_JOYPAD_* ids. */
export const RETROPAD = [
  "b", "y", "select", "start", "up", "down", "left", "right",
  "a", "x", "l", "r", "l2", "r2", "l3", "r3",
] as const;
export type RetroPadButton = (typeof RETROPAD)[number];

export const bit = (button: RetroPadButton) => 1 << RETROPAD.indexOf(button);

export type InputState = {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
};

export const INPUT_BYTES = 8;
export const PING_BYTES = 9;
export const PING = 1;
export const PONG = 2;

/** Writes into `out` so the per-frame send path never allocates. */
export function encodeInput(seq: number, s: InputState, out: DataView) {
  out.setUint16(0, seq & 0xffff);
  out.setUint16(2, s.buttons & 0xffff);
  out.setInt8(4, s.lx);
  out.setInt8(5, s.ly);
  out.setInt8(6, s.rx);
  out.setInt8(7, s.ry);
}

/** Returns the seq; fills `into`. */
export function decodeInput(view: DataView, into: InputState): number {
  into.buttons = view.getUint16(2);
  into.lx = view.getInt8(4);
  into.ly = view.getInt8(5);
  into.rx = view.getInt8(6);
  into.ry = view.getInt8(7);
  return view.getUint16(0);
}

/** True if `a` is newer than `b`, allowing for uint16 wraparound. */
export function seqNewer(a: number, b: number) {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

export function encodePing(kind: typeof PING | typeof PONG, time: number, out: DataView) {
  out.setUint8(0, kind);
  out.setFloat64(1, time);
}

export type Game = { title: string; system: string };
export type PlayerInfo = { slot: number; name: string; isHost?: boolean; rttMs?: number };

export type ControlMessage =
  | { t: "hello"; name: string }
  | { t: "welcome"; hostName: string; game: Game | null; players: PlayerInfo[]; spectators: number }
  | { t: "claim" }
  | { t: "unclaim" }
  /** 0 means spectator. */
  | { t: "slot"; slot: number }
  | { t: "players"; players: PlayerInfo[]; spectators: number }
  | { t: "game"; game: Game | null }
  | { t: "offer"; sdp: string }
  | { t: "answer"; sdp: string }
  | { t: "end" };
