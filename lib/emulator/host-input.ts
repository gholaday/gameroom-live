import { injectorCodes } from "@/lib/emulator/injector";
import { MAPPABLE, type KeyMap, type PadMap } from "@/lib/input/mapping";

// The host plays through RetroArch's own keyboard and gamepad input (the
// lowest-latency path), so the host's mapping becomes player 1's
// retroarch.cfg entries at boot. Changes apply from the next game start.

const NAMED: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Enter: "enter", Space: "space", Tab: "tab", Backspace: "backspace",
  ShiftLeft: "shift", ShiftRight: "rshift", ControlLeft: "ctrl", ControlRight: "rctrl",
  AltLeft: "alt", AltRight: "ralt",
  Comma: "comma", Period: "period", Slash: "slash", Semicolon: "semicolon", Quote: "quote",
  BracketLeft: "leftbracket", BracketRight: "rightbracket", Backslash: "backslash",
  Minus: "minus", Equal: "equals", Backquote: "backquote",
};

/** RetroArch's name for a KeyboardEvent.code, or null if we don't know one. */
export function retroarchKey(code: string): string | null {
  if (NAMED[code]) return NAMED[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase();
  m = /^Digit(\d)$/.exec(code);
  if (m) return `num${m[1]}`;
  m = /^F(\d{1,2})$/.exec(code);
  if (m) return `f${m[1]}`;
  return null;
}

/**
 * Keys the host can't use for player 1: Esc opens our menu, F1 opens
 * RetroArch's, and the rest are injected for players 2 to 4.
 */
export const HOST_RESERVED = new Set(["Escape", "F1", ...injectorCodes()]);

/** player 1 retroarch.cfg entries for the host's mapping. */
export function hostInputConfig(keys: KeyMap, pad: PadMap): Record<string, string> {
  const config: Record<string, string> = {};
  for (const button of MAPPABLE) {
    const key = keys[button] && !HOST_RESERVED.has(keys[button]) ? retroarchKey(keys[button]) : null;
    config[`input_player1_${button}`] = key ?? "nul";
    config[`input_player1_${button}_btn`] = pad[button] >= 0 ? String(pad[button]) : "nul";
  }
  return config;
}
