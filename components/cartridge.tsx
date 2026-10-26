"use client";

import { useState, type ReactNode } from "react";
import type { SystemId } from "@/lib/emulator/systems";
import type { Game } from "@/lib/net/protocol";

// Cartridges drawn from each system's real dimensions, in millimetres, so a
// shelf shows them at true relative size. No logos or brand marks.

/** Pixels per millimetre. A home console cart comes out around 175 px wide. */
export const CART_SCALE = 1.3;

type Shape = {
  w: number;
  h: number;
  body: string;
  fill: string;
  /** Recess the label sits in. */
  label: { x: number; y: number; w: number; h: number; r: number };
  recess: string;
  details: ReactNode;
  /** Initials size on the fallback label. */
  initials: string;
};

const lines = (n: number, step: number, at: (i: number) => string, stroke: string, width = 0.8) => (
  <path d={Array.from({ length: n }, (_, i) => at(i * step)).join("")} stroke={stroke} strokeWidth={width} fill="none" />
);

const SHAPES: Record<SystemId, Shape> = {
  // 16-bit home cart, 137 x 120: rounded top, grips down both sides.
  snes: {
    w: 137,
    h: 120,
    body: "M10 0H127Q137 0 137 10V114Q137 120 131 120H6Q0 120 0 114V10Q0 0 10 0Z",
    fill: "#C9C9CF",
    label: { x: 15, y: 10, w: 107, h: 76, r: 3 },
    recess: "#B3B3BA",
    details: (
      <>
        {lines(15, 4, (y) => `M3 ${20 + y}H10M127 ${20 + y}H134`, "#A9A9B1")}
        <path d="M0 100H137V114Q137 120 131 120H6Q0 120 0 114Z" fill="#BBBBC2" />
      </>
    ),
    initials: "text-3xl",
  },
  // 8-bit home cart, 120 x 133: tall, label up top, deep grooves below.
  nes: {
    w: 120,
    h: 133,
    body: "M4 0H116Q120 0 120 4V129Q120 133 116 133H4Q0 133 0 129V4Q0 0 4 0Z",
    fill: "#8F8F96",
    label: { x: 9, y: 8, w: 102, h: 80, r: 2 },
    recess: "#7E7E85",
    details: lines(8, 4, (y) => `M10 ${98 + y}H110`, "#75757C", 1.4),
    initials: "text-3xl",
  },
  // 16-bit black cart, 130 x 108: big rounded shoulders, ribbed grip at the base.
  genesis: {
    w: 130,
    h: 108,
    body: "M16 0H114Q130 0 130 16V102Q130 108 124 108H6Q0 108 0 102V16Q0 0 16 0Z",
    fill: "#26262B",
    label: { x: 11, y: 12, w: 108, h: 66, r: 3 },
    recess: "#18181B",
    details: (
      <>
        <path d="M16 1.5H114" stroke="#45454C" strokeWidth={1.2} />
        {lines(19, 5, (x) => `M${20 + x} 87V101`, "#3C3C43", 1.2)}
      </>
    ),
    initials: "text-3xl",
  },
  // Handheld cart, 57 x 65: clipped top corner, ridged grip, arrow at the base.
  gb: {
    w: 57,
    h: 65,
    body: "M3 0H50L57 7V62Q57 65 54 65H3Q0 65 0 62V3Q0 0 3 0Z",
    fill: "#BCBCC3",
    label: { x: 6, y: 14, w: 45, h: 40, r: 2 },
    recess: "#A8A8B0",
    details: (
      <>
        {lines(4, 2, (y) => `M6 ${3 + y}H44`, "#A2A2AA", 0.7)}
        <path d="M25.5 58.5L28.5 61.5L31.5 58.5Z" fill="#A2A2AA" />
      </>
    ),
    initials: "text-lg",
  },
  // Small handheld cart, 57 x 35: wide and short, with a tab along the top.
  gba: {
    w: 57,
    h: 35,
    body: "M8 0H49Q51 0 51 2V3H55Q57 3 57 5V33Q57 35 55 35H2Q0 35 0 33V5Q0 3 2 3H6V2Q6 0 8 0Z",
    fill: "#5A5A62",
    label: { x: 5, y: 7, w: 47, h: 24, r: 2 },
    recess: "#48484F",
    details: <path d="M8 1H49" stroke="#6E6E77" strokeWidth={0.8} />,
    initials: "text-base",
  },
};

export function cartSize(systemId: SystemId) {
  const s = SHAPES[systemId];
  return { width: s.w * CART_SCALE, height: s.h * CART_SCALE };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** A cartridge with the game's box art on its label. `ghost` is the empty spot it leaves on a shelf. */
export function Cartridge({ game, ghost, className = "" }: { game: Game; ghost?: boolean; className?: string }) {
  const s = SHAPES[game.systemId];
  const { width, height } = cartSize(game.systemId);
  if (ghost)
    return (
      <span aria-hidden className={`relative block ${className}`} style={{ width, height }}>
        <svg viewBox={`0 0 ${s.w} ${s.h}`} className="absolute inset-0 h-full w-full overflow-visible">
          <path d={s.body} fill="none" stroke="var(--slot-empty)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    );
  const l = s.label;
  return (
    <span aria-hidden className={`relative block ${className}`} style={{ width, height }}>
      <svg viewBox={`0 0 ${s.w} ${s.h}`} className="absolute inset-0 h-full w-full overflow-visible">
        <path d={s.body} fill={s.fill} />
        {s.details}
        <rect x={l.x - 1.5} y={l.y - 1.5} width={l.w + 3} height={l.h + 3} rx={l.r + 1} fill={s.recess} />
      </svg>
      <span
        className="absolute flex overflow-hidden"
        style={{
          left: pct(l.x, s.w),
          top: pct(l.y, s.h),
          width: pct(l.w, s.w),
          height: pct(l.h, s.h),
          borderRadius: l.r * CART_SCALE,
        }}
      >
        <LabelArt game={game} initials={s.initials} />
      </span>
    </span>
  );
}

const ART_COLORS = ["#E5603F", "#1F9E89", "#7A5AF0", "#E0A21B", "#1A5FC0"];

/** Box art when libretro has it; generated initials while it loads or if it doesn't. */
function LabelArt({ game, initials: size }: { game: Game; initials: string }) {
  const [failed, setFailed] = useState(false);
  let hash = 0;
  for (const ch of game.title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = ART_COLORS[hash % ART_COLORS.length];
  const initials = game.title
    .split(/\s+/)
    // Capitalized words only, so "The Legend of Zelda" reads TLZ.
    .filter((w) => /^[A-Z0-9]/.test(w))
    .slice(0, 3)
    // Keep numbers whole so "Mario Kart 64" reads MK64.
    .map((w) => (/^\d/.test(w) ? w : w[0]))
    .join("");
  return (
    <span
      className={`relative flex flex-1 items-center justify-center font-extrabold text-white/90 ${size}`}
      style={{ background: `linear-gradient(135deg, ${color}, #2B2B2E)` }}
    >
      {initials}
      {game.cover && !failed && (
        // Plain <img>: cross-origin, already sized, and next/image would need a remote loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      )}
    </span>
  );
}
