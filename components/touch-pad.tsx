"use client";

import { useEffect, useRef } from "react";
import { dpadMask } from "@/lib/input/touch";
import { bit, type RetroPadButton } from "@/lib/net/protocol";

/**
 * On-screen SNES pad for phones. One pointer handler on the whole pad tracks
 * every finger, so sliding between buttons and pressing several at once work.
 * Pressed states are set on the DOM directly; React renders the pad once.
 */
export function TouchPad({ onChange }: { onChange: (mask: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const fingers = new Map<number, number>();
    let mask = 0;

    const maskAt = (x: number, y: number) => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-mask],[data-dpad]");
      if (!el || !root.contains(el)) return 0;
      if (el.dataset.mask) return Number(el.dataset.mask);
      const r = el.getBoundingClientRect();
      return dpadMask((x - r.left - r.width / 2) / (r.width / 2), (y - r.top - r.height / 2) / (r.height / 2));
    };

    const update = () => {
      let next = 0;
      for (const m of fingers.values()) next |= m;
      if (next === mask) return;
      if (next & ~mask) navigator.vibrate?.(8);
      mask = next;
      onChange(mask);
      for (const el of root.querySelectorAll<HTMLElement>("[data-mask]")) {
        el.toggleAttribute("data-pressed", (mask & Number(el.dataset.mask)) !== 0);
      }
      for (const el of root.querySelectorAll<HTMLElement>("[data-dir]")) {
        el.toggleAttribute("data-pressed", (mask & Number(el.dataset.dir)) !== 0);
      }
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      fingers.set(e.pointerId, maskAt(e.clientX, e.clientY));
      update();
    };
    const move = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, maskAt(e.clientX, e.clientY));
      update();
    };
    const up = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      update();
    };

    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    root.addEventListener("lostpointercapture", up);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      root.removeEventListener("lostpointercapture", up);
      onChange(0);
    };
  }, [onChange]);

  return (
    <div
      ref={rootRef}
      // Fingers move between buttons freely: no scrolling, zooming or selection.
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex touch-none select-none items-end justify-between px-5 pb-[max(20px,env(safe-area-inset-bottom))] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-start gap-4">
        <Btn button="l" className="h-11 w-24 rounded-full text-sm">L</Btn>
        <div data-dpad="" className="relative h-[150px] w-[150px] rounded-full bg-white/10">
          <Dir button="up" className="top-1 left-1/2 -translate-x-1/2" />
          <Dir button="down" className="bottom-1 left-1/2 -translate-x-1/2" />
          <Dir button="left" className="top-1/2 left-1 -translate-y-1/2" />
          <Dir button="right" className="top-1/2 right-1 -translate-y-1/2" />
        </div>
      </div>

      {/* Portrait phones are too narrow for three columns: sit between L and R. */}
      <div className="mb-2 flex gap-3 portrait:absolute portrait:top-1.5 portrait:left-1/2 portrait:mb-0 portrait:-translate-x-1/2">
        <Btn button="select" className="h-8 w-16 rounded-full text-[11px]">Select</Btn>
        <Btn button="start" className="h-8 w-16 rounded-full text-[11px]">Start</Btn>
      </div>

      <div className="flex flex-col items-end gap-4">
        <Btn button="r" className="h-11 w-24 rounded-full text-sm">R</Btn>
        <div className="relative h-[160px] w-[160px]">
          <Btn button="x" className="absolute top-0 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full">X</Btn>
          <Btn button="y" className="absolute top-1/2 left-0 h-14 w-14 -translate-y-1/2 rounded-full">Y</Btn>
          <Btn button="a" className="absolute top-1/2 right-0 h-14 w-14 -translate-y-1/2 rounded-full">A</Btn>
          <Btn button="b" className="absolute bottom-0 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full">B</Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({ button, className, children }: { button: RetroPadButton; className: string; children: string }) {
  return (
    <div
      data-mask={bit(button)}
      className={`flex items-center justify-center bg-white/15 font-extrabold text-white/90 data-[pressed]:bg-white/45 ${className}`}
    >
      {children}
    </div>
  );
}

/** Visual only: the D-pad's hit test is by angle over the whole circle. */
function Dir({ button, className }: { button: RetroPadButton; className: string }) {
  return <span data-dir={bit(button)} className={`absolute h-11 w-11 rounded-lg bg-white/15 data-[pressed]:bg-white/45 ${className}`} />;
}
