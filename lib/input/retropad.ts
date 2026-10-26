import { DEFAULT_PAD, padMasks } from "@/lib/input/mapping";
import type { InputState } from "@/lib/net/protocol";

const DEFAULT_MASKS = padMasks(DEFAULT_PAD);

const DEADZONE = 0.2;
const toInt8 = (v: number) => (Math.abs(v) < DEADZONE ? 0 : Math.round(Math.max(-1, Math.min(1, v)) * 127));

type PadLike = Pick<Gamepad, "buttons" | "axes">;

/**
 * Reads a standard-mapped gamepad into `out` through the player's mapping
 * ([button index, RetroPad mask] pairs, see controls.ts). No allocation.
 */
export function readGamepad(pad: PadLike, out: InputState, masks: readonly (readonly [number, number])[] = DEFAULT_MASKS) {
  let buttons = 0;
  for (const [i, mask] of masks) if (pad.buttons[i]?.pressed) buttons |= mask;
  out.buttons = buttons;
  out.lx = toInt8(pad.axes[0] ?? 0);
  out.ly = toInt8(pad.axes[1] ?? 0);
  out.rx = toInt8(pad.axes[2] ?? 0);
  out.ry = toInt8(pad.axes[3] ?? 0);
}
