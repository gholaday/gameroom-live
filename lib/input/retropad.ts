import { bit, type InputState, type RetroPadButton } from "@/lib/net/protocol";

// Standard Gamepad mapping to RetroPad, by position (RetroPad uses the SNES
// layout): bottom face = B, right = A, left = Y, top = X.
const PAD_BUTTONS: [index: number, button: RetroPadButton][] = [
  [0, "b"], [1, "a"], [2, "y"], [3, "x"],
  [4, "l"], [5, "r"], [6, "l2"], [7, "r2"],
  [8, "select"], [9, "start"], [10, "l3"], [11, "r3"],
  [12, "up"], [13, "down"], [14, "left"], [15, "right"],
];
const PAD_MASKS = PAD_BUTTONS.map(([i, b]) => [i, bit(b)] as const);

const DEADZONE = 0.2;
const toInt8 = (v: number) => (Math.abs(v) < DEADZONE ? 0 : Math.round(Math.max(-1, Math.min(1, v)) * 127));

type PadLike = Pick<Gamepad, "buttons" | "axes">;

/** Reads a standard-mapped gamepad into `out`. No allocation. */
export function readGamepad(pad: PadLike, out: InputState) {
  let buttons = 0;
  for (const [i, mask] of PAD_MASKS) if (pad.buttons[i]?.pressed) buttons |= mask;
  out.buttons = buttons;
  out.lx = toInt8(pad.axes[0] ?? 0);
  out.ly = toInt8(pad.axes[1] ?? 0);
  out.rx = toInt8(pad.axes[2] ?? 0);
  out.ry = toInt8(pad.axes[3] ?? 0);
}

/** Guest keyboard layout, same as RetroArch's player 1 defaults. */
export const KEYBOARD: Record<string, number> = {
  ArrowUp: bit("up"),
  ArrowDown: bit("down"),
  ArrowLeft: bit("left"),
  ArrowRight: bit("right"),
  KeyX: bit("a"),
  KeyZ: bit("b"),
  KeyS: bit("x"),
  KeyA: bit("y"),
  KeyQ: bit("l"),
  KeyW: bit("r"),
  Enter: bit("start"),
  ShiftRight: bit("select"),
};
