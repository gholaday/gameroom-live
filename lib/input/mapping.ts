import { bit, type RetroPadButton } from "@/lib/net/protocol";

// Which physical key or gamepad button drives each RetroPad button. Pure data
// and helpers; storage is in controls.ts.

/** KeyboardEvent.code per button; "" means unbound. */
export type KeyMap = Record<RetroPadButton, string>;
/** Standard Gamepad button index per button; -1 means unbound. */
export type PadMap = Record<RetroPadButton, number>;

/** Buttons the Controls screen lists, in display order. */
export const MAPPABLE: readonly RetroPadButton[] = [
  "up", "down", "left", "right",
  "a", "b", "x", "y",
  "l", "r", "l2", "r2",
  "select", "start",
];

/** RetroPad uses the SNES layout: bottom face = B, right = A, left = Y, top = X. */
export const DEFAULT_PAD: PadMap = {
  b: 0, a: 1, y: 2, x: 3,
  l: 4, r: 5, l2: 6, r2: 7,
  select: 8, start: 9, l3: 10, r3: 11,
  up: 12, down: 13, left: 14, right: 15,
};

/** Same as RetroArch's player 1 keyboard defaults. */
export const DEFAULT_KEYS: KeyMap = {
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  a: "KeyX", b: "KeyZ", x: "KeyS", y: "KeyA",
  l: "KeyQ", r: "KeyW", l2: "", r2: "",
  select: "ShiftRight", start: "Enter", l3: "", r3: "",
};

/**
 * Binds `button` to `input`. Whatever button had that input before swaps to
 * this button's old input, so nothing silently loses its binding.
 */
export function bind<T extends string | number>(
  map: Record<RetroPadButton, T>,
  button: RetroPadButton,
  input: T,
): Record<RetroPadButton, T> {
  const next = { ...map };
  const other = (Object.keys(next) as RetroPadButton[]).find((b) => b !== button && next[b] === input);
  if (other) next[other] = map[button];
  next[button] = input;
  return next;
}

/** Keyboard lookup for the hot path: code to RetroPad bitmask. */
export function keyMasks(map: KeyMap): Map<string, number> {
  const masks = new Map<string, number>();
  for (const [button, code] of Object.entries(map) as [RetroPadButton, string][]) {
    if (code) masks.set(code, (masks.get(code) ?? 0) | bit(button));
  }
  return masks;
}

/** Gamepad lookup for the hot path: [button index, RetroPad mask] pairs. */
export function padMasks(map: PadMap): (readonly [number, number])[] {
  return (Object.entries(map) as [RetroPadButton, number][])
    .filter(([, index]) => index >= 0)
    .map(([button, index]) => [index, bit(button)] as const);
}
