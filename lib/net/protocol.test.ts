import { describe, expect, it } from "vitest";
import { bit, chatText, decodeInput, encodeInput, INPUT_BYTES, MAX_CHAT, seqNewer, type InputState } from "./protocol";

describe("input packet", () => {
  it("round-trips every field, including negative sticks", () => {
    const view = new DataView(new ArrayBuffer(INPUT_BYTES));
    const sent: InputState = { buttons: bit("b") | bit("start") | bit("r3"), lx: -128, ly: 127, rx: -1, ry: 0 };
    encodeInput(513, sent, view);
    const got: InputState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
    expect(decodeInput(view, got)).toBe(513);
    expect(got).toEqual(sent);
  });

  it("uses libretro joypad bit order", () => {
    expect(bit("b")).toBe(1);
    expect(bit("start")).toBe(1 << 3);
    expect(bit("a")).toBe(1 << 8);
    expect(bit("r3")).toBe(1 << 15);
  });
});

describe("seqNewer", () => {
  it("orders across the uint16 wrap", () => {
    expect(seqNewer(1, 0)).toBe(true);
    expect(seqNewer(0, 1)).toBe(false);
    expect(seqNewer(2, 0xfffe)).toBe(true);
    expect(seqNewer(0xfffe, 2)).toBe(false);
    expect(seqNewer(7, 7)).toBe(false);
  });
});

describe("chatText", () => {
  it("collapses whitespace, trims, and caps the length", () => {
    expect(chatText("  gg \n  wp\t ")).toBe("gg wp");
    expect(chatText("   ")).toBe("");
    expect(chatText("x".repeat(MAX_CHAT + 50))).toHaveLength(MAX_CHAT);
  });
});
