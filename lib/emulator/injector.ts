import type { Nostalgist } from "nostalgist";
import { RETROPAD, type RetroPadButton } from "@/lib/net/protocol";

// Remote players drive RetroArch through per-player keyboard bindings.
// Nostalgist's pressDown() re-reads the RetroArch config file on every call,
// so we bind fixed keys once and call RetroArch's key handlers directly, which
// is what pressDown does underneath. Cost per input change: a short loop.

/** Keys no player 1 default or RetroArch hotkey uses. */
const BINDINGS: Record<number, Partial<Record<RetroPadButton, string>>> = {
  2: {
    up: "t", down: "g", left: "f", right: "h",
    b: "k", a: "l", y: "j", x: "i",
    l: "u", r: "o", l2: "v", r2: "b",
    select: "n", start: "m",
  },
};

export const REMOTE_PLAYERS = Object.keys(BINDINGS).map(Number);

/** retroarchConfig entries for the bindings above. */
export function remoteBindingsConfig(): Record<string, string> {
  const config: Record<string, string> = {};
  for (const [player, keys] of Object.entries(BINDINGS)) {
    for (const [button, key] of Object.entries(keys)) config[`input_player${player}_${button}`] = key;
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
        RETROPAD.map((b) => (keys[b] ? `Key${keys[b]!.toUpperCase()}` : null)),
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
