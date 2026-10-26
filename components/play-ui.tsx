"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Send } from "lucide-react";
import { Avatar, Dot, Hint, HintBar, latencyClass, type PlayerSlot } from "@/components/ui";
import { MAX_NAME } from "@/lib/identity";
import { chatText, MAX_CHAT, type ChatLine, type PlayerInfo } from "@/lib/net/protocol";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";

/**
 * Latency and fps pill over the game. Filled by writing to the DOM from a
 * stats loop (see setPill), never by React state, so it costs no re-renders.
 */
export const StatsPill = forwardRef<HTMLSpanElement, { onClick?: () => void; expanded?: boolean }>(function StatsPill(
  { onClick, expanded },
  ref,
) {
  const body = (
    <span
      ref={ref}
      className="inline-flex items-center gap-2 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold text-text"
    >
      <Dot className="bg-slot-empty" size={8} />
      <span data-pill="rtt">Connecting</span>
      <span data-pill="fps" className="font-bold text-text-muted" />
    </span>
  );
  if (!onClick) return <span className="absolute top-6 left-6 z-10">{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label="Latency details"
      className="ring-row absolute top-6 left-6 z-10 rounded-full"
    >
      {body}
    </button>
  );
});

const BREAKDOWN_ROWS = [
  ["network", "Network round trip"],
  ["frames", "Waiting on frames"],
  ["encode", "Host encode"],
  ["buffer", "Jitter buffer"],
  ["decode", "Decode"],
  ["total", "Estimated total"],
] as const;

/** Where a guest's input-to-screen time goes. Values are written by setBreakdown. */
export const LatencyBreakdown = forwardRef<HTMLDListElement>(function LatencyBreakdown(_, ref) {
  return (
    <dl
      ref={ref}
      className="absolute top-[70px] left-6 z-10 grid min-w-[220px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-card bg-white/95 px-4 py-3 text-[13px] font-bold text-text shadow-soft"
    >
      {BREAKDOWN_ROWS.map(([key, label]) => (
        <div key={key} className={`contents ${key === "total" ? "font-extrabold" : ""}`}>
          <dt className={key === "total" ? "mt-1 border-t border-bg pt-1" : "text-text-muted"}>{label}</dt>
          <dd data-lat={key} className={`text-right tabular-nums ${key === "total" ? "mt-1 border-t border-bg pt-1" : ""}`}>
            ...
          </dd>
        </div>
      ))}
    </dl>
  );
});

export function setBreakdown(el: HTMLElement | null, values: Record<(typeof BREAKDOWN_ROWS)[number][0], number>) {
  if (!el) return;
  for (const [key] of BREAKDOWN_ROWS) {
    const dd = el.querySelector<HTMLElement>(`[data-lat="${key}"]`);
    const text = `${values[key]} ms`;
    if (dd && dd.textContent !== text) dd.textContent = text;
  }
}

const DOT_CLASSES = ["bg-ok", "bg-p4", "bg-danger", "bg-slot-empty"];

/** `label` replaces the RTT text, e.g. with the guest's estimated total. */
export function setPill(pill: HTMLElement | null, rttMs: number | null, fps: number | null, label?: string) {
  if (!pill) return;
  const dot = pill.firstElementChild as HTMLElement;
  const rtt = pill.querySelector<HTMLElement>('[data-pill="rtt"]')!;
  const f = pill.querySelector<HTMLElement>('[data-pill="fps"]')!;
  const dotClass = rttMs === null ? "bg-slot-empty" : rttMs < 40 ? "bg-ok" : rttMs < 80 ? "bg-p4" : "bg-danger";
  if (!dot.classList.contains(dotClass)) {
    dot.classList.remove(...DOT_CLASSES);
    dot.classList.add(dotClass);
  }
  const rttText = label ?? (rttMs === null ? "Local" : `${Math.round(rttMs)} ms`);
  const fpsText = fps === null ? "" : `${Math.round(fps)} fps`;
  if (rtt.textContent !== rttText) rtt.textContent = rttText;
  if (f.textContent !== fpsText) f.textContent = fpsText;
}

/**
 * Menu open state with an exit animation: `open` drives game mode (so input
 * goes back to the game the moment you close), `shown` keeps the panel
 * mounted while it slides out.
 */
export function useMenu() {
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  return {
    open: state === "open",
    shown: state !== "closed",
    closing: state === "closing",
    toggle: () => setState((s) => (s === "open" ? "closing" : "open")),
    openMenu: () => setState("open"),
    close: () => setState((s) => (s === "open" ? "closing" : s)),
    onClosed: () => setState((s) => (s === "closing" ? "closed" : s)),
  };
}

export function MenuPanel({
  system,
  title,
  players,
  spectators,
  onBack,
  closing = false,
  onClosed,
  isSelf,
  onRename,
  chat,
  children,
}: {
  system: string;
  title: string;
  players: PlayerInfo[];
  spectators: number;
  onBack: () => void;
  /** Slide out, then call onClosed. */
  closing?: boolean;
  onClosed?: () => void;
  /** Which row is you: that one gets a rename button. */
  isSelf?: (p: PlayerInfo) => boolean;
  onRename?: (name: string) => void;
  chat?: { lines: ChatLine[]; onSend: (text: string) => void };
  children: ReactNode;
}) {
  useInitialFocus(!closing);
  useNavAction("back", onBack, !closing);
  // animationend can go missing (a tab that stops painting mid-slide). Don't
  // leave the closed menu's backdrop over the game waiting for it.
  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => onClosed?.(), 400);
    return () => clearTimeout(id);
  }, [closing, onClosed]);
  return (
    <>
      <div
        aria-hidden
        className={`absolute inset-0 z-20 bg-black/45 ${closing ? "fade-out pointer-events-none" : "fade-in"}`}
        onClick={closing ? undefined : onBack}
      />
      <aside
        aria-label="Game menu"
        inert={closing}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClosed?.();
        }}
        className={`${closing ? "menu-out" : "menu-in"} absolute top-0 right-0 bottom-0 z-30 flex w-full max-w-[420px] flex-col overflow-y-auto rounded-l-menu bg-panel`}
      >
        <div className="flex flex-col gap-1 px-7 pt-7 pb-[18px]">
          <span className="text-[13px] font-bold text-text-muted">{system}</span>
          <h1 className="text-2xl font-extrabold">{title}</h1>
        </div>
        <ul className="flex flex-col gap-1 px-5" aria-label="Players">
          {players.map((p) => (
            <li key={p.slot} className="flex items-center gap-3 p-2">
              <Avatar slot={p.slot as PlayerSlot} name={p.name} size={36} />
              {onRename && isSelf?.(p) ? (
                <EditableName name={p.name} onSave={onRename} />
              ) : (
                <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
              )}
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
        {chat && <ChatBox lines={chat.lines} onSend={chat.onSend} />}
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
  icon,
}: {
  children: string;
  onClick: () => void;
  isDefault?: boolean;
  danger?: boolean;
  /** Shown at the right edge, e.g. a copy icon. */
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-default={isDefault ? "" : undefined}
      className={`ring-row flex min-h-[52px] items-center justify-between gap-3 rounded-xl px-4 text-left text-base font-bold focus:bg-surface focus:font-extrabold ${
        danger ? "font-extrabold text-danger" : "text-text focus:text-primary-text"
      }`}
    >
      {children}
      {icon && <span className="flex-none text-text-muted">{icon}</span>}
    </button>
  );
}

/** Your name in the menu's player list, with a small button that edits it in place. Enter saves, Esc cancels. */
function EditableName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useNavAction("back", () => setEditing(false), editing);
  // Put focus back on the button once the field closes.
  useEffect(() => {
    if (was.current && !editing) buttonRef.current?.focus();
    was.current = editing;
  }, [editing]);

  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value);
          setEditing(false);
        }}
        className="flex min-w-0 flex-1"
      >
        <input
          autoFocus
          aria-label="Your name"
          value={value}
          maxLength={MAX_NAME}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setEditing(false)}
          // The emulator's key handler on document cancels every key; keep typing from reaching it.
          onKeyDown={(e) => e.stopPropagation()}
          className="ring-row min-h-9 min-w-0 flex-1 rounded-full border-none bg-surface px-3 text-base font-bold text-text"
        />
      </form>
    );
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="truncate font-bold">{name}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Change your name"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="ring-row flex h-8 w-8 flex-none items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text focus:bg-surface"
      >
        <Pencil size={15} aria-hidden />
      </button>
    </span>
  );
}

const NAME_COLOR = ["text-text-muted", "text-p1", "text-p2", "text-p3", "text-lat-fair"];

/** The room's chat inside the game menu: recent lines and a box to send one. */
function ChatBox({ lines, onSend }: { lines: ChatLine[]; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  // Stay on the newest line.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section aria-label="Chat" className="mx-5 mt-4 flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
      <ol ref={listRef} aria-live="polite" className="scrollbar flex max-h-[200px] flex-col gap-1.5 overflow-y-auto px-2">
        {lines.length ? (
          lines.map((l) => (
            <li key={l.id} className="text-sm leading-snug break-words">
              <span className={`font-extrabold ${NAME_COLOR[l.slot] ?? NAME_COLOR[0]}`}>{l.name}</span>{" "}
              <span className="font-semibold">{l.text}</span>
            </li>
          ))
        ) : (
          <li className="text-[13px] font-semibold text-text-muted">No messages yet.</li>
        )}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!chatText(draft)) return;
          onSend(draft);
          setDraft("");
        }}
        className="flex gap-2"
      >
        <input
          aria-label="Message"
          placeholder="Message everyone"
          value={draft}
          maxLength={MAX_CHAT}
          onChange={(e) => setDraft(e.target.value)}
          // The emulator's key handler on document cancels every key; keep typing from reaching it.
          onKeyDown={(e) => e.stopPropagation()}
          className="ring-row min-h-11 min-w-0 flex-1 rounded-full border-none bg-surface px-4 text-sm font-bold text-text placeholder:font-semibold placeholder:text-text-muted"
        />
        <button
          type="submit"
          aria-label="Send"
          className="ring-row flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary-text text-white"
        >
          <Send size={17} aria-hidden />
        </button>
      </form>
    </section>
  );
}

/** Most chat lines shown over the game at once. */
const MAX_TOASTS = 5;

/**
 * New chat lines over the game while the menu is closed, stacking down the
 * screen. Each slides in, holds, fades out, then leaves the stack. Lines that
 * were already there when it mounted stay hidden.
 */
export function ChatToast({ lines }: { lines: ChatLine[] }) {
  const [seen] = useState(() => lines.at(-1)?.id ?? 0);
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set());
  const shown = lines.filter((l) => l.id > seen && !gone.has(l.id)).slice(-MAX_TOASTS);
  if (!shown.length) return null;
  return (
    <ol
      aria-hidden
      className="pointer-events-none absolute top-[70px] right-6 z-10 flex max-w-[min(380px,calc(100%-48px))] flex-col items-end gap-2"
    >
      {shown.map((l) => (
        <li
          key={l.id}
          onAnimationEnd={() => setGone((g) => new Set(g).add(l.id))}
          className="chat-toast rounded-2xl bg-white/92 px-4 py-2.5 text-sm leading-snug break-words shadow-soft"
        >
          <span className={`font-extrabold ${NAME_COLOR[l.slot] ?? NAME_COLOR[0]}`}>{l.name}</span>{" "}
          <span className="font-semibold text-text">{l.text}</span>
        </li>
      ))}
    </ol>
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
