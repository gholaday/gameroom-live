import type { RetroPadButton } from "@/lib/net/protocol";
import { bind, DEFAULT_KEYS, DEFAULT_PAD, keyMasks, padMasks, type KeyMap, type PadMap } from "@/lib/input/mapping";

// The player's control mappings, per device, in localStorage. The keyboard has
// one map; each gamepad model (Gamepad.id) gets its own. React reads snapshots
// through subscribe/getControls; the input loop reads the cached masks.

const KEY = "gameroom-controls";

export type Controls = { keys: KeyMap; pads: Record<string, PadMap> };

let controls: Controls | null = null;
let keyCache: Map<string, number> | null = null;
const padCache = new Map<string, (readonly [number, number])[]>();
const listeners = new Set<() => void>();
const DEFAULTS: Controls = { keys: DEFAULT_KEYS, pads: {} };

function load(): Controls {
  if (controls) return controls;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Controls> | null;
    // Merge over defaults so buttons added later still have a binding.
    controls = {
      keys: { ...DEFAULT_KEYS, ...saved?.keys },
      pads: Object.fromEntries(Object.entries(saved?.pads ?? {}).map(([id, map]) => [id, { ...DEFAULT_PAD, ...map }])),
    };
  } catch {
    controls = { keys: DEFAULT_KEYS, pads: {} };
  }
  return controls;
}

function save(next: Controls) {
  controls = next;
  keyCache = null;
  padCache.clear();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const fn of listeners) fn();
}

export const subscribeControls = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getControls = () => (typeof window === "undefined" ? DEFAULTS : load());

export const padMapFor = (padId: string): PadMap => load().pads[padId] ?? DEFAULT_PAD;

export function setKey(button: RetroPadButton, code: string) {
  const c = load();
  save({ ...c, keys: bind(c.keys, button, code) });
}

export function setPadButton(padId: string, button: RetroPadButton, index: number) {
  const c = load();
  save({ ...c, pads: { ...c.pads, [padId]: bind(padMapFor(padId), button, index) } });
}

export function resetKeys() {
  save({ ...load(), keys: DEFAULT_KEYS });
}

export function resetPad(padId: string) {
  const pads = { ...load().pads };
  delete pads[padId];
  save({ ...load(), pads });
}

/** Hot path: keyboard code to RetroPad mask. */
export function keyMask(code: string) {
  keyCache ??= keyMasks(load().keys);
  return keyCache.get(code) ?? 0;
}

/** Hot path: [button index, mask] pairs for this gamepad model. */
export function padMasksFor(padId: string) {
  let masks = padCache.get(padId);
  if (!masks) padCache.set(padId, (masks = padMasks(padMapFor(padId))));
  return masks;
}
