"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Gamepad2, Keyboard } from "lucide-react";
import {
  getControls,
  padMapFor,
  resetKeys,
  resetPad,
  setKey,
  setPadButton,
  subscribeControls,
} from "@/lib/input/controls";
import { MAPPABLE } from "@/lib/input/mapping";
import type { RetroPadButton } from "@/lib/net/protocol";
import { suspendNav } from "@/lib/nav/manager";

const BUTTON_NAMES: Partial<Record<RetroPadButton, string>> = {
  up: "D-pad up", down: "D-pad down", left: "D-pad left", right: "D-pad right",
  a: "A", b: "B", x: "X", y: "Y", l: "L", r: "R", l2: "L2", r2: "R2",
  select: "Select", start: "Start",
};

/** Standard Gamepad button positions; labels differ by brand, positions don't. */
const PAD_NAMES = [
  "Bottom face", "Right face", "Left face", "Top face",
  "Left bumper", "Right bumper", "Left trigger", "Right trigger",
  "Back", "Start", "Left stick", "Right stick",
  "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home",
];

/**
 * Remaps keyboard and controller buttons, per device. `reserved` lists keys
 * this screen won't accept (the host's are taken by players 2 to 4).
 */
export function ControlsPanel({ reserved, note }: { reserved?: ReadonlySet<string>; note?: string }) {
  const controls = useSyncExternalStore(subscribeControls, getControls, getControls);
  const pads = useConnectedPads();
  const [device, setDevice] = useState<string>("keyboard");
  const [listening, setListening] = useState<RetroPadButton | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A pad that was unplugged falls back to the keyboard tab.
  const active = device === "keyboard" || pads.some((p) => p.id === device) ? device : "keyboard";
  const isPad = active !== "keyboard";

  useBinding(listening, active, reserved, {
    onKey: (button, code) => {
      setKey(button, code);
      setListening(null);
      setMessage(null);
    },
    onPad: (button, index) => {
      setPadButton(active, button, index);
      setListening(null);
      setMessage(null);
    },
    onReserved: () => setMessage("That key is used by another player. Pick a different one."),
    onCancel: () => setListening(null),
  });

  const padMap = isPad ? padMapFor(active) : null;

  return (
    <section aria-label="Controls" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">Controls</h2>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Device">
          <DeviceTab selected={active === "keyboard"} onClick={() => setDevice("keyboard")}>
            <Keyboard size={16} aria-hidden /> Keyboard
          </DeviceTab>
          {pads.map((p) => (
            <DeviceTab key={p.id} selected={active === p.id} onClick={() => setDevice(p.id)}>
              <Gamepad2 size={16} aria-hidden /> {shortPadName(p.id)}
            </DeviceTab>
          ))}
        </div>
      </div>
      {note && <p className="text-[13px] font-semibold text-text-muted">{note}</p>}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5">
        {MAPPABLE.map((button) => {
          const current = isPad ? padLabel(padMap![button]) : keyLabel(controls.keys[button]);
          const waiting = listening === button;
          return (
            <li key={button}>
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setListening(waiting ? null : button);
                }}
                aria-label={`${BUTTON_NAMES[button]}: ${current}. Change`}
                className={`ring-row flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3.5 text-left text-sm ${
                  waiting ? "bg-primary-text text-white" : "bg-bg"
                }`}
              >
                <span className="font-extrabold">{BUTTON_NAMES[button]}</span>
                <span className={`font-bold ${waiting ? "" : "text-text-muted"}`}>
                  {waiting ? (isPad ? "Press a button" : "Press a key") : current}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-[13px] font-bold text-text-muted">
          {message ?? (listening ? "Esc to cancel." : "Select a button, then press the key or button you want.")}
        </p>
        <button
          type="button"
          onClick={() => (isPad ? resetPad(active) : resetKeys())}
          className="ring-row min-h-9 rounded-full bg-bg px-3.5 text-xs font-extrabold"
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}

/** While a row is listening, navigation is off and the next key or new button press binds. */
function useBinding(
  listening: RetroPadButton | null,
  device: string,
  reserved: ReadonlySet<string> | undefined,
  on: {
    onKey: (b: RetroPadButton, code: string) => void;
    onPad: (b: RetroPadButton, index: number) => void;
    onReserved: () => void;
    onCancel: () => void;
  },
) {
  useEffect(() => {
    if (!listening) return;
    const resume = suspendNav();
    let raf = 0;
    let swallowUp: string | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      // Keep the key from activating the focused row or reaching anything else.
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === "Escape") return on.onCancel();
      if (device !== "keyboard") return;
      if (reserved?.has(e.code)) return on.onReserved();
      swallowUp = e.code;
      on.onKey(listening, e.code);
    };
    // Space and Enter click on keyup too; eat the release of the bound key.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== swallowUp) return;
      e.preventDefault();
      e.stopPropagation();
      swallowUp = null;
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });

    if (device !== "keyboard") {
      // Only a button pressed after listening started counts (not the one that opened it).
      const held = new Set<number>();
      const pad0 = findPad(device);
      pad0?.buttons.forEach((b, i) => b.pressed && held.add(i));
      const poll = () => {
        const pad = findPad(device);
        const index = pad?.buttons.findIndex((b, i) => b.pressed && !held.has(i)) ?? -1;
        pad?.buttons.forEach((b, i) => !b.pressed && held.delete(i));
        if (index >= 0) on.onPad(listening, index);
        else raf = requestAnimationFrame(poll);
      };
      raf = requestAnimationFrame(poll);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      // The keyup listener outlives this listen, to catch the bound key's release.
      setTimeout(() => window.removeEventListener("keyup", onKeyUp, { capture: true }), 1000);
      resume();
    };
    // Handlers are recreated each render; the listen only depends on these.
  }, [listening, device, reserved]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useConnectedPads() {
  const [pads, setPads] = useState<{ id: string }[]>([]);
  useEffect(() => {
    const update = () =>
      setPads(
        [...new Map(navigator.getGamepads().flatMap((p) => (p?.connected ? [[p.id, { id: p.id }] as const] : []))).values()],
      );
    update();
    window.addEventListener("gamepadconnected", update);
    window.addEventListener("gamepaddisconnected", update);
    return () => {
      window.removeEventListener("gamepadconnected", update);
      window.removeEventListener("gamepaddisconnected", update);
    };
  }, []);
  return pads;
}

function findPad(id: string) {
  for (const p of navigator.getGamepads()) if (p?.connected && p.id === id) return p;
  return null;
}

function DeviceTab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`ring-row inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold ${
        selected ? "bg-primary-text text-white" : "bg-bg text-text"
      }`}
    >
      {children}
    </button>
  );
}

/** "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e ...)" reads "Xbox Wireless Controller". */
function shortPadName(id: string) {
  return id.replace(/\s*\(.*$/, "").trim().slice(0, 28) || "Controller";
}

function keyLabel(code: string) {
  if (!code) return "None";
  const m = /^(?:Key|Digit)(.+)$/.exec(code);
  if (m) return m[1];
  const arrow = /^Arrow(\w+)$/.exec(code);
  if (arrow) return `${arrow[1]} arrow`;
  const side = /^(Shift|Control|Alt)(Left|Right)$/.exec(code);
  if (side) return `${side[2]} ${side[1] === "Control" ? "Ctrl" : side[1]}`;
  const pad = /^Numpad(.+)$/.exec(code);
  if (pad) return `Numpad ${pad[1]}`;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function padLabel(index: number) {
  if (index < 0) return "None";
  return PAD_NAMES[index] ?? `Button ${index}`;
}
