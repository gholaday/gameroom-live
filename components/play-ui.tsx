"use client";

import { forwardRef, type ReactNode } from "react";
import { Avatar, Dot, Hint, HintBar, latencyClass, type PlayerSlot } from "@/components/ui";
import type { PlayerInfo } from "@/lib/net/protocol";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";

/**
 * Latency and fps pill over the game. Filled by writing to the DOM from a
 * stats loop (see setPill), never by React state, so it costs no re-renders.
 */
export const StatsPill = forwardRef<HTMLSpanElement>(function StatsPill(_, ref) {
  return (
    <span
      ref={ref}
      className="absolute top-6 left-6 z-10 inline-flex items-center gap-2 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold"
    >
      <Dot className="bg-slot-empty" size={8} />
      <span data-pill="rtt">Connecting</span>
      <span data-pill="fps" className="font-bold text-text-muted" />
    </span>
  );
});

const DOT_CLASSES = ["bg-ok", "bg-p4", "bg-danger", "bg-slot-empty"];

export function setPill(pill: HTMLElement | null, rttMs: number | null, fps: number | null) {
  if (!pill) return;
  const dot = pill.firstElementChild as HTMLElement;
  const rtt = pill.querySelector<HTMLElement>('[data-pill="rtt"]')!;
  const f = pill.querySelector<HTMLElement>('[data-pill="fps"]')!;
  const dotClass = rttMs === null ? "bg-slot-empty" : rttMs < 40 ? "bg-ok" : rttMs < 80 ? "bg-p4" : "bg-danger";
  if (!dot.classList.contains(dotClass)) {
    dot.classList.remove(...DOT_CLASSES);
    dot.classList.add(dotClass);
  }
  const rttText = rttMs === null ? "Local" : `${Math.round(rttMs)} ms`;
  const fpsText = fps === null ? "" : `${Math.round(fps)} fps`;
  if (rtt.textContent !== rttText) rtt.textContent = rttText;
  if (f.textContent !== fpsText) f.textContent = fpsText;
}

export function MenuPanel({
  system,
  title,
  players,
  spectators,
  onBack,
  children,
}: {
  system: string;
  title: string;
  players: PlayerInfo[];
  spectators: number;
  onBack: () => void;
  children: ReactNode;
}) {
  useInitialFocus();
  useNavAction("back", onBack);
  return (
    <>
      <div aria-hidden className="absolute inset-0 z-20 bg-black/45" onClick={onBack} />
      <aside
        aria-label="Game menu"
        className="menu-in absolute top-0 right-0 bottom-0 z-30 flex w-full max-w-[420px] flex-col overflow-y-auto rounded-l-menu bg-panel"
      >
        <div className="flex flex-col gap-1 px-7 pt-7 pb-[18px]">
          <span className="text-[13px] font-bold text-text-muted">{system}</span>
          <h1 className="text-2xl font-extrabold">{title}</h1>
        </div>
        <ul className="flex flex-col gap-1 px-5" aria-label="Players">
          {players.map((p) => (
            <li key={p.slot} className="flex items-center gap-3 p-2">
              <Avatar slot={p.slot as PlayerSlot} name={p.name} size={36} />
              <span className="flex-1 font-bold">{p.name}</span>
              {p.isHost ? (
                <span className="text-[13px] font-bold text-text-muted">Host</span>
              ) : (
                <span className={`text-[13px] font-bold ${latencyClass(p.rttMs ?? 0)}`}>{p.rttMs} ms</span>
              )}
            </li>
          ))}
          {spectators > 0 && (
            <li className="px-2 pt-1 text-[13px] font-bold text-text-muted">
              {spectators} watching
            </li>
          )}
        </ul>
        <nav className="mx-5 mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3.5">{children}</nav>
        <div className="mt-auto flex justify-end px-7 pt-[18px] pb-[22px]">
          <HintBar>
            <Hint button="B">Back</Hint>
            <Hint button="A">OK</Hint>
          </HintBar>
        </div>
      </aside>
    </>
  );
}

export function MenuRow({
  children,
  onClick,
  isDefault,
  danger,
}: {
  children: string;
  onClick: () => void;
  isDefault?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-default={isDefault ? "" : undefined}
      className={`ring-row min-h-[52px] rounded-xl px-4 text-left text-base font-bold focus:bg-surface focus:font-extrabold ${
        danger ? "font-extrabold text-danger" : "text-text focus:text-primary-text"
      }`}
    >
      {children}
    </button>
  );
}

export function MenuNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="px-4 pt-2 text-[13px] font-bold text-text-muted">
      {children}
    </p>
  );
}

export function MenuHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute bottom-5 left-6 text-[13px] font-bold text-white/45">
      Esc, Home, or Select+Start for the menu
    </span>
  );
}
