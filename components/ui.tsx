import type { ReactNode } from "react";
export type PlayerSlot = 1 | 2 | 3 | 4;

const SLOT_STYLE: Record<PlayerSlot, string> = {
  1: "bg-p1 text-white",
  2: "bg-p2 text-white",
  3: "bg-p3 text-white",
  4: "bg-p4 text-text",
};

export function slotClass(slot: PlayerSlot) {
  return SLOT_STYLE[slot];
}

export function Avatar({
  slot,
  name,
  size = 44,
  className = "",
}: {
  slot: PlayerSlot;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}
      className={`flex flex-none items-center justify-center rounded-full font-extrabold ${slotClass(slot)} ${className}`}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

export function EmptySlot({ size = 44, label }: { size?: number; label?: string }) {
  return (
    <span
      aria-label={label}
      style={{ width: size, height: size }}
      className="box-border block flex-none rounded-full border-2 border-dashed border-slot-empty"
    />
  );
}

export function Dot({ className = "bg-ok", size = 9 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`inline-block flex-none rounded-full ${className}`}
    />
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-sm font-bold ${className}`}
    >
      {children}
    </span>
  );
}

/** A controller button glyph with its label, for footer hint bars. */
export function Hint({ button, children }: { button: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-text text-xs font-extrabold text-white"
      >
        {button}
      </span>
      {children}
    </span>
  );
}

export function HintBar({ children }: { children: ReactNode }) {
  return <div className="flex gap-[22px] text-sm font-bold">{children}</div>;
}

export function Footer({ status, hints }: { status: ReactNode; hints: ReactNode }) {
  return (
    <footer className="mx-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 pb-[22px] max-sm:mx-4">
      <div className="text-sm font-semibold text-text-muted">{status}</div>
      <HintBar>{hints}</HintBar>
    </footer>
  );
}

/** Latency text color by quality, as in the in-game menu mockup. */
export function latencyClass(ms: number) {
  if (ms < 40) return "text-lat-good";
  if (ms < 80) return "text-lat-fair";
  return "text-danger";
}

export function latencyDotClass(ms: number) {
  if (ms < 40) return "bg-ok";
  if (ms < 80) return "bg-p4";
  return "bg-danger";
}
