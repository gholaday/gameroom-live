// Spatial focus manager. Drives real DOM focus from the keyboard and from
// gamepads so the selection ring is always the browser's own focus state.
//
// Keyboard: arrows move, Enter activates (native), Escape is "back".
// Gamepad (standard mapping): D-pad or left stick moves, A activates,
// B is "back", X / Y / Start / Home fire named actions.
//
// In game mode the UI ignores everything except Home or Select+Start (and
// Escape on the keyboard), so the game gets the controller, Start included.

export type Direction = "up" | "down" | "left" | "right";
export type NavAction = "back" | "x" | "y" | "start";

type Handler = () => void;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), [data-nav]';

// Standard Gamepad mapping indices.
const BTN = { a: 0, b: 1, x: 2, y: 3, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15, home: 16 } as const;
const STICK_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 380;
const REPEAT_RATE_MS = 110;

const handlers: Record<NavAction, Handler[]> = { back: [], x: [], y: [], start: [] };
const anyButtonListeners = new Set<Handler>();
let gameModeDepth = 0;
let started = false;

export function onNavAction(action: NavAction, handler: Handler): () => void {
  handlers[action].push(handler);
  return () => {
    const list = handlers[action];
    const i = list.lastIndexOf(handler);
    if (i >= 0) list.splice(i, 1);
  };
}

/** Most recently registered handler wins, like a stack of screens. */
function fire(action: NavAction): boolean {
  const list = handlers[action];
  const handler = list[list.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

/** Fires on any gamepad button press. Used for "press any button to join". */
export function onAnyGamepadButton(handler: Handler): () => void {
  anyButtonListeners.add(handler);
  return () => {
    anyButtonListeners.delete(handler);
  };
}

export function enterGameMode(): () => void {
  gameModeDepth++;
  return () => {
    gameModeDepth = Math.max(0, gameModeDepth - 1);
  };
}

const inGameMode = () => gameModeDepth > 0;

let suspendDepth = 0;
/**
 * Turns all navigation off, for "press a key to bind" screens. Button state is
 * still tracked, so a button held when navigation resumes isn't a new press.
 */
export function suspendNav(): () => void {
  suspendDepth++;
  return () => {
    suspendDepth = Math.max(0, suspendDepth - 1);
  };
}

// Marks whether the last input came from keyboard/gamepad or a pointer, so
// CSS can show the ring for programmatic focus exactly like :focus-visible.
function setInputMode(mode: "nav" | "pointer") {
  const root = document.documentElement;
  if (root.dataset.input !== mode) root.dataset.input = mode;
}

function candidates(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest("[inert]") || el.dataset.nav === "skip") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function current(): HTMLElement | null {
  const el = document.activeElement;
  if (!el || el === document.body || !(el instanceof HTMLElement)) return null;
  return el.closest("[inert]") ? null : el;
}

export function focusDefault() {
  const list = candidates();
  const preferred = list.find((el) => el.hasAttribute("data-nav-default"));
  const target = preferred ?? list[0];
  if (target) focusEl(target);
}

/** Pick the nearest focusable in a direction, favoring aligned elements. */
export function move(dir: Direction) {
  const from = current();
  if (!from) {
    focusDefault();
    return;
  }
  const a = from.getBoundingClientRect();
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;
  const aCenter = horizontal ? a.left + a.width / 2 : a.top + a.height / 2;

  // Best inside the 45 degree cone, and best overall as a fallback.
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  let fallback: HTMLElement | null = null;
  let fallbackScore = Infinity;
  for (const el of candidates()) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bCenter = horizontal ? b.left + b.width / 2 : b.top + b.height / 2;
    if ((bCenter - aCenter) * sign <= 1) continue;

    // Gap along the travel axis, measured edge to edge.
    const primary = horizontal
      ? Math.max(0, sign > 0 ? b.left - a.right : a.left - b.right)
      : Math.max(0, sign > 0 ? b.top - a.bottom : a.top - b.bottom);
    // Gap on the cross axis; zero when the two elements overlap there.
    const orth = horizontal
      ? Math.max(0, b.top - a.bottom, a.top - b.bottom)
      : Math.max(0, b.left - a.right, a.left - b.right);
    const crossCenter = horizontal
      ? Math.abs(b.top + b.height / 2 - (a.top + a.height / 2))
      : Math.abs(b.left + b.width / 2 - (a.left + a.width / 2));

    // Elements that overlap on the cross axis ("in the beam") always beat
    // ones off to the side, so right from a button row reaches the card
    // beside it instead of jumping up into the row above.
    const outOfBeam = orth > 0 ? 1e6 : 0;
    const score = outOfBeam + primary + orth * 3 + crossCenter * 0.1;

    // Off-axis elements should sit within a 45 degree cone of the direction,
    // so "right" prefers things to the right over things mostly above.
    const inCone = orth === 0 || crossCenter <= Math.abs(bCenter - aCenter);
    if (inCone && score < bestScore) {
      bestScore = score;
      best = el;
    }
    if (score < fallbackScore) {
      fallbackScore = score;
      fallback = el;
    }
  }
  const target = best ?? fallback;
  if (target) focusEl(target);
}

function activate() {
  const el = current();
  if (el) el.click();
  else focusDefault();
}

// ---------- Keyboard ----------

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * Capture phase on window, so it runs before the emulator's own key handler on
 * document, which marks every key as handled (defaultPrevented).
 */
function onKeyDown(e: KeyboardEvent) {
  if (suspendDepth > 0 || e.altKey || e.ctrlKey || e.metaKey) return;

  if (inGameMode()) {
    if (e.key === "Escape" && !e.repeat && fire("start")) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }

  const dir = KEY_DIRS[e.key];
  if (dir) {
    const t = e.target;
    const editing =
      t instanceof HTMLInputElement && !t.readOnly && (dir === "left" || dir === "right");
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    setInputMode("nav");
    move(dir);
    return;
  }
  if (e.key === "Escape") {
    if (fire("back")) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (e.key === "Enter" || e.key === " " || e.key === "Tab") {
    setInputMode("nav");
    // Keep the emulator from cancelling the native click on a focused button.
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) e.stopPropagation();
  }
}

// ---------- Gamepad ----------

type PadState = { pressed: boolean[]; dir: Direction | null; nextRepeat: number };
const pads = new Map<number, PadState>();
let rafId = 0;

function stickDir(pad: Gamepad): Direction | null {
  const b = pad.buttons;
  if (b[BTN.up]?.pressed) return "up";
  if (b[BTN.down]?.pressed) return "down";
  if (b[BTN.left]?.pressed) return "left";
  if (b[BTN.right]?.pressed) return "right";
  const [x = 0, y = 0] = pad.axes;
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_THRESHOLD) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function pollPads(now: number) {
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;
    let state = pads.get(pad.index);
    if (!state) {
      state = { pressed: [], dir: null, nextRepeat: 0 };
      pads.set(pad.index, state);
    }
    const down = (i: number) => !!pad.buttons[i]?.pressed && !state.pressed[i];

    if (suspendDepth > 0) {
      state.dir = null;
    } else if (inGameMode()) {
      if (pad.buttons.some((_, i) => down(i))) anyButtonListeners.forEach((fn) => fn());
      // Start belongs to the game, so the menu is Home or Select+Start.
      const chord = down(BTN.start) && !!pad.buttons[BTN.select]?.pressed;
      if (chord || down(BTN.home)) fire("start");
      state.dir = null;
    } else {
      if (pad.buttons.some((_, i) => down(i))) anyButtonListeners.forEach((fn) => fn());
      const dir = stickDir(pad);
      if (dir && (dir !== state.dir || now >= state.nextRepeat)) {
        setInputMode("nav");
        move(dir);
        state.nextRepeat = now + (dir !== state.dir ? REPEAT_DELAY_MS : REPEAT_RATE_MS);
      }
      state.dir = dir;

      if (down(BTN.a)) {
        setInputMode("nav");
        activate();
      }
      if (down(BTN.b)) fire("back");
      if (down(BTN.x)) fire("x");
      if (down(BTN.y)) fire("y");
      if (down(BTN.start) || down(BTN.home)) fire("start");
    }
    state.pressed = pad.buttons.map((btn) => btn.pressed);
  }
  rafId = pads.size > 0 ? requestAnimationFrame(pollPads) : 0;
}

function onPadConnected(e: GamepadEvent) {
  // Seed with the current state so the press that woke the pad up
  // doesn't also activate something.
  pads.set(e.gamepad.index, {
    pressed: e.gamepad.buttons.map((b) => b.pressed),
    dir: null,
    nextRepeat: 0,
  });
  if (!rafId) rafId = requestAnimationFrame(pollPads);
}

function onPadDisconnected(e: GamepadEvent) {
  pads.delete(e.gamepad.index);
}

export function startNav() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("pointerdown", () => setInputMode("pointer"), { capture: true });
  window.addEventListener("gamepadconnected", onPadConnected);
  window.addEventListener("gamepaddisconnected", onPadDisconnected);
  // Pads that were connected before this page loaded.
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (pad) onPadConnected(new GamepadEvent("gamepadconnected", { gamepad: pad }));
  }
}
