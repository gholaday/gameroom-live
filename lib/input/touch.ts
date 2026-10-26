import { bit } from "@/lib/net/protocol";

const UP = bit("up");
const DOWN = bit("down");
const LEFT = bit("left");
const RIGHT = bit("right");
/** tan(22.5 deg): beyond this off-axis ratio a press counts as a diagonal. */
const DIAGONAL = 0.4142;

/**
 * 8-way D-pad from a touch offset relative to the pad's center, in units of
 * the pad's radius. Inside `deadzone` nothing is pressed.
 */
export function dpadMask(dx: number, dy: number, deadzone = 0.25) {
  if (dx * dx + dy * dy < deadzone * deadzone) return 0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let mask = 0;
  if (ax >= ay * DIAGONAL) mask |= dx > 0 ? RIGHT : LEFT;
  if (ay >= ax * DIAGONAL) mask |= dy > 0 ? DOWN : UP;
  return mask;
}
