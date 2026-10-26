import type { Nostalgist } from "nostalgist";
import { RETROPAD, type RetroPadButton } from "@/lib/net/protocol";

// Remote players drive RetroArch through per-player keyboard bindings.
// Nostalgist's pressDown() re-reads the RetroArch config file on every call,
// so we bind fixed keys once and call RetroArch's key handlers directly, which
// is what pressDown does underneath. Cost per input change: a short loop.

/** A RetroArch key name and the KeyboardEvent.code its web input reads. */
type Key = readonly [retroarch: string, code: string];
const letter = (k: string): Key => [k, `Key${k.toUpperCase()}`];

/**
 * Keys no player 1 default uses. Nostalgist turns off the RetroArch hotkeys
 * that would otherwise collide (reset, pause, save state and so on).
 */
const BINDINGS: Record<number, Partial<Record<RetroPadButton, Key>>> = {
  2: {
    up: letter("t"), down: letter("g"), left: letter("f"), right: letter("h"),
    b: letter("k"), a: letter("l"), y: letter("j"), x: letter("i"),
    l: letter("u"), r: letter("o"), l2: letter("v"), r2: letter("b"),
    select: letter("n"), start: letter("m"),
  },
  // Number pad.
  3: {
    up: ["keypad8", "Numpad8"], down: ["keypad2", "Numpad2"],
    left: ["keypad4", "Numpad4"], right: ["keypad6", "Numpad6"],
    b: ["keypad1", "Numpad1"], a: ["keypad3", "Numpad3"],
    y: ["keypad7", "Numpad7"], x: ["keypad9", "Numpad9"],
    l: ["keypad0", "Numpad0"], r: ["kp_period", "NumpadDecimal"],
    l2: ["kp_minus", "NumpadSubtract"], r2: ["kp_plus", "NumpadAdd"],
    select: ["divide", "NumpadDivide"], start: ["multiply", "NumpadMultiply"],
  },
  // Digit row and punctuation.
  4: {
    up: ["num8", "Digit8"], down: ["num2", "Digit2"],
    left: ["num4", "Digit4"], right: ["num6", "Digit6"],
    b: ["num1", "Digit1"], a: ["num3", "Digit3"],
    y: ["num7", "Digit7"], x: ["num9", "Digit9"],
    l: ["num0", "Digit0"], r: ["num5", "Digit5"],
    l2: ["leftbracket", "BracketLeft"], r2: ["rightbracket", "BracketRight"],
    select: ["comma", "Comma"], start: ["semicolon", "Semicolon"],
  },
};

/** Player numbers guests can take, up to what the system supports. */
export function remotePlayers(maxPlayers: number) {
  return Object.keys(BINDINGS).map(Number).filter((p) => p <= maxPlayers);
}

/** Every KeyboardEvent.code the injector uses, so player 1 can avoid them. */
export function injectorCodes(): string[] {
  return Object.values(BINDINGS).flatMap((keys) => Object.values(keys).map((k) => k![1]));
}

/** retroarchConfig entries for the bindings above. */
export function remoteBindingsConfig(): Record<string, string> {
  const config: Record<string, string> = {};
  for (const [player, keys] of Object.entries(BINDINGS)) {
    for (const [button, key] of Object.entries(keys)) config[`input_player${player}_${button}`] = key[0];
  }
  return config;
}

type KeyHandler = { eventTypeString: string; eventListenerFunc: (e: unknown) => void };

export class InputInjector {
  /** KeyboardEvent.code per player, indexed by RetroPad bit. */
  private readonly codes = new Map<number, (string | null)[]>();
  private readonly applied = new Map<number, number>();
  private readonly event = { code: "", target: null as unknown, preventDefault() {}, stopPropagation() {} };

  constructor(private readonly emu: Nostalgist) {
    this.event.target = emu.getCanvas();
    for (const [player, keys] of Object.entries(BINDINGS)) {
      this.codes.set(
        Number(player),
        RETROPAD.map((b) => keys[b]?.[1] ?? null),
      );
    }
  }

  /** Applies a full button state for a player, firing only the edges. */
  apply(player: number, buttons: number) {
    const codes = this.codes.get(player);
    if (!codes) return;
    const prev = this.applied.get(player) ?? 0;
    let diff = prev ^ buttons;
    if (!diff) return;
    this.applied.set(player, buttons);
    while (diff) {
      const i = 31 - Math.clz32(diff);
      diff &= ~(1 << i);
      const code = codes[i];
      if (code) this.fire(buttons & (1 << i) ? "keydown" : "keyup", code);
    }
  }

  releaseAll(player: number) {
    this.apply(player, 0);
  }

  private fire(type: "keydown" | "keyup", code: string) {
    const handlers = (this.emu.getEmscripten() as { JSEvents: { eventHandlers: KeyHandler[] } }).JSEvents
      .eventHandlers;
    this.event.code = code;
    for (const h of handlers) {
      if (h.eventTypeString === type) h.eventListenerFunc(this.event);
    }
  }
}
