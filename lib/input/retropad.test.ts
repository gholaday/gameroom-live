import { describe, expect, it } from "vitest";
import { bit, type InputState } from "@/lib/net/protocol";
import { readGamepad } from "./retropad";

const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) as unknown as Gamepad["buttons"],
  axes,
});

describe("readGamepad", () => {
  it("maps face buttons by position and the D-pad", () => {
    const out: InputState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
    readGamepad(pad([0, 1, 9, 12]), out);
    expect(out.buttons).toBe(bit("b") | bit("a") | bit("start") | bit("up"));
  });

  it("applies a deadzone and scales sticks to int8", () => {
    const out: InputState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
    readGamepad(pad([], [0.1, -1, 1, 0.5]), out);
    expect(out).toMatchObject({ lx: 0, ly: -127, rx: 127, ry: 64 });
  });
});
