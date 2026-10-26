"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Eye, Gamepad2, Hand, Keyboard, Plus, Users } from "lucide-react";
import { ControlsPanel } from "@/components/controls-panel";
import { GuestPlay } from "@/components/guest-play";
import { EditableName } from "@/components/play-ui";
import { StreamVideo } from "@/components/stream-video";
import { Avatar, Dot, EmptySlot, Footer, Hint, type PlayerSlot } from "@/components/ui";
import { GuestSession, type GuestSnapshot, type InputMode } from "@/lib/guest/session";
import { getName } from "@/lib/identity";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";

const SLOTS: PlayerSlot[] = [1, 2, 3, 4];
/** Esc opens the game menu. */
const GUEST_RESERVED = new Set(["Escape"]);

const MODES: { mode: InputMode; label: string; Icon: typeof Gamepad2 }[] = [
  { mode: "gamepad", label: "Controller", Icon: Gamepad2 },
  { mode: "keyboard", label: "Keyboard", Icon: Keyboard },
  { mode: "touch", label: "Touch", Icon: Hand },
];

/** A controller if one is plugged in, touch on a phone, else the keyboard. */
function likelyMode(): InputMode {
  if (navigator.getGamepads().some((p) => p?.connected)) return "gamepad";
  if (window.matchMedia("(pointer: coarse)").matches) return "touch";
  return "keyboard";
}

export function GuestJoin({ code }: { code: string }) {
  const [session] = useState(() => new GuestSession(code));
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [view, setView] = useState<"lobby" | "play">("lobby");
  const [showControls, setShowControls] = useState(false);
  // The spot whose join picker is open.
  const [picking, setPicking] = useState<PlayerSlot | null>(null);
  const [name, setNameValue] = useState(() => (typeof window === "undefined" ? "Guest" : getName("Guest")));
  const rttRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    void session.connect();
    return () => session.close();
  }, [session]);

  // Footer RTT straight to the DOM, twice a second.
  useEffect(() => {
    if (view !== "lobby") return;
    const id = setInterval(() => {
      const el = rttRef.current;
      const text = session.rttMs ? `${Math.round(session.rttMs)} ms` : "";
      if (el && el.textContent !== text) el.textContent = text;
    }, 500);
    return () => clearInterval(id);
  }, [session, view]);

  const connected = snap.status === "connected";
  // Before the host starts a game we don't know the system; assume it has room.
  const maxPlayers = snap.game?.maxPlayers ?? SLOTS.length;
  const slots = SLOTS.slice(0, maxPlayers);
  const solo = maxPlayers === 1;
  const owner = (slot: PlayerSlot) => snap.players.find((p) => p.slot === slot);
  const open = (slot: PlayerSlot) => !owner(slot) && slot !== snap.slot;
  // Every controller is in use: watching is the way in until someone leaves.
  const full = !solo && !snap.slot && !slots.some(open);
  const canPlay = connected && !solo && !full;
  // A spot taken while its picker is open closes the picker.
  const pick = picking && (open(picking) || picking === snap.slot) && canPlay ? picking : null;

  const join = (slot: PlayerSlot, mode: InputMode) => {
    session.claim(mode, slot);
    setPicking(null);
    setView("play");
  };
  const watch = () => {
    session.watch();
    setView("play");
  };

  useInitialFocus(view === "lobby");
  useNavAction("back", watch, connected && view === "lobby" && !pick);
  useNavAction("back", () => setPicking(null), view === "lobby" && !!pick);

  if (view === "play") {
    return <GuestPlay session={session} snap={snap} onLobby={() => setView("lobby")} />;
  }

  // The first open spot (or your own) takes focus, so a controller's A opens its picker.
  const focusSlot = snap.slot || slots.find(open) || 0;

  return (
    <div className="flex h-dvh flex-col">
      <main className="scrollbar flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-4 pt-8 pb-4">
        <div className="flex flex-none flex-col items-center gap-1 text-center">
          <h1 className="text-[clamp(26px,4vh,34px)] leading-tight font-extrabold">
            {snap.game?.title ?? "Waiting for the host"}
          </h1>
          <EditableName
            name={name}
            className="w-[240px] justify-center text-lg"
            onSave={(n) => {
              session.rename(n);
              setNameValue(getName("Guest"));
            }}
          />
        </div>

        {/* The picture takes whatever height is left, at 8:7. */}
        <div className="flex min-h-[200px] w-full flex-1 items-center justify-center [container-type:size]">
          <div
            style={{ width: "min(560px, 100cqw, calc(100cqh * 8 / 7))" }}
            className="relative flex aspect-[8/7] items-center justify-center overflow-hidden rounded-card bg-text text-[13px] text-[#C9C9CF] shadow-stream"
          >
            {snap.stream ? (
              <StreamVideo stream={snap.stream} muted className="h-full w-full object-contain" />
            ) : (
              <span className="px-4 text-center">{statusText(snap.status, snap.error)}</span>
            )}
            {snap.stream && (
              <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-[5px] text-xs font-extrabold text-text">
                <Dot className="bg-live" size={8} />
                Live
              </span>
            )}
          </div>
        </div>

        {connected && (full || solo) && (
          <p
            role="status"
            className="fade-in inline-flex flex-none items-center gap-2.5 rounded-full bg-surface py-2 pr-5 pl-3 text-sm font-extrabold shadow-soft"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg text-text-muted">
              <Users size={16} aria-hidden />
            </span>
            {solo ? "This is a 1-player game." : `All ${maxPlayers} player spots are filled.`}
            <span className="font-bold text-text-muted">You can still watch.</span>
          </p>
        )}

        <div className="flex flex-none flex-wrap justify-center gap-x-[30px] gap-y-4">
          {slots.map((slot) => (
            <Slot
              key={slot}
              slot={slot}
              owner={owner(slot)?.name}
              mine={slot === snap.slot}
              joinable={canPlay && (open(slot) || slot === snap.slot)}
              dim={full}
              focusDefault={slot === focusSlot}
              picking={pick === slot}
              onPick={() => setPicking(pick === slot ? null : slot)}
              onClose={() => setPicking(null)}
              onJoin={(mode) => join(slot, mode)}
            />
          ))}
        </div>

        <div className="flex flex-none flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled={!connected}
            onClick={watch}
            className={`ring-row inline-flex min-h-12 items-center gap-2 rounded-full px-[22px] text-sm font-extrabold disabled:opacity-50 ${
              full || solo ? "bg-primary-text text-white shadow-soft" : "bg-surface text-text shadow-soft"
            }`}
          >
            <Eye size={18} aria-hidden />
            {snap.slot ? "Watch instead" : "Watch"}
          </button>
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            className="ring-row min-h-12 rounded-full px-[18px] text-sm font-extrabold text-primary-text"
          >
            {showControls ? "Hide controls" : "Controls"}
          </button>
        </div>
        {showControls && (
          <div className="w-full max-w-[720px] flex-none">
            <ControlsPanel reserved={GUEST_RESERVED} />
          </div>
        )}
      </main>

      <Footer
        status={
          <span className="inline-flex items-center gap-2 font-bold">
            <Dot className={connected ? "bg-ok" : snap.status === "connecting" || snap.status === "waiting" ? "bg-slot-empty" : "bg-danger"} />
            {connected ? "Connected" : statusText(snap.status, snap.error)}
            <span ref={rttRef} className="text-text" />
            {snap.spectators > 0 && <span>{snap.spectators} watching</span>}
          </span>
        }
        hints={
          pick ? (
            <>
              <Hint button="A">Select</Hint>
              <Hint button="B">Back</Hint>
            </>
          ) : (
            <>
              {canPlay && <Hint button="A">Pick a spot</Hint>}
              <Hint button="B">Watch</Hint>
            </>
          )
        }
      />
    </div>
  );
}

export function statusText(status: GuestSnapshot["status"], error: string | null) {
  if (status === "connecting") return "Connecting to the room";
  if (status === "waiting") return "Waiting for the host to come back";
  if (status === "ended") return "The host ended the session.";
  if (status === "kicked") return "The host removed you from the room.";
  if (status === "error") return error ?? "Could not connect.";
  return "Waiting for the host to start a game";
}

/** One player spot. An open one (or your own) opens a picker above it to choose controls and join. */
function Slot({
  slot,
  owner,
  mine,
  joinable,
  dim,
  focusDefault,
  picking,
  onPick,
  onClose,
  onJoin,
}: {
  slot: PlayerSlot;
  owner?: string;
  mine: boolean;
  joinable: boolean;
  dim: boolean;
  focusDefault: boolean;
  picking: boolean;
  onPick: () => void;
  onClose: () => void;
  onJoin: (mode: InputMode) => void;
}) {
  const label = mine ? "You" : (owner ?? "Open");
  const face = owner || mine ? <Avatar slot={slot} name={mine ? "You" : owner!} size={76} /> : null;

  return (
    <div className={`relative flex w-24 flex-col items-center gap-2 transition-opacity ${dim ? "opacity-80" : ""}`}>
      {joinable ? (
        <button
          type="button"
          onClick={onPick}
          {...(focusDefault ? { "data-nav-default": "" } : {})}
          aria-expanded={picking}
          aria-label={mine ? `You are Player ${slot}. Change controls` : `Join as Player ${slot}`}
          className="ring-tile group/slot rounded-full"
        >
          {face ?? (
            <span
              className={`box-border flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-dashed transition-[border-color,background-color,color,transform] duration-200 ease-out group-hover/slot:scale-105 group-hover/slot:border-solid group-hover/slot:border-focus group-hover/slot:bg-surface group-hover/slot:text-primary-text ${
                picking ? "scale-105 border-solid border-focus bg-surface text-primary-text" : "border-slot-empty text-slot-empty"
              }`}
            >
              <Plus size={30} strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </button>
      ) : (
        (face ?? <EmptySlot size={76} />)
      )}
      <span className={`max-w-full truncate text-sm ${owner || mine ? "font-extrabold" : "font-bold text-text-muted"}`}>
        {label}
      </span>
      <span className="-mt-2 text-xs font-semibold text-text-muted">Player {slot}</span>
      {picking && <JoinPicker slot={slot} mine={mine} onClose={onClose} onJoin={onJoin} />}
    </div>
  );
}

/** Floats above a spot: pick a control type, then join. */
function JoinPicker({
  slot,
  mine,
  onClose,
  onJoin,
}: {
  slot: PlayerSlot;
  mine: boolean;
  onClose: () => void;
  onJoin: (mode: InputMode) => void;
}) {
  const [mode, setMode] = useState<InputMode>(likelyMode);
  const ref = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    joinRef.current?.focus();
    // A click anywhere else closes it; clicks on its own spot toggle it there.
    const onDown = (e: PointerEvent) => {
      const spot = ref.current?.parentElement;
      if (spot && !spot.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Join as Player ${slot}`}
      className="picker-in absolute bottom-full left-1/2 z-20 -translate-x-1/2 mb-3 w-[232px] rounded-card bg-surface p-3 shadow-lift"
    >
      <p className="px-1 pb-2 text-xs font-extrabold tracking-wide text-text-muted uppercase">Player {slot} controls</p>
      <div role="radiogroup" className="flex flex-col gap-1">
        {MODES.map(({ mode: m, label, Icon }) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`ring-row flex min-h-10 items-center gap-2.5 rounded-tile px-3 text-sm font-extrabold transition-colors duration-150 ${
              mode === m ? "bg-primary-text/10 text-primary-text" : "text-text hover:bg-bg"
            }`}
          >
            <Icon size={18} aria-hidden />
            {label}
            <span
              className={`ml-auto h-2 w-2 rounded-full bg-primary-text transition-opacity ${mode === m ? "opacity-100" : "opacity-0"}`}
            />
          </button>
        ))}
      </div>
      <button
        ref={joinRef}
        type="button"
        onClick={() => onJoin(mode)}
        className="ring-row mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary-text text-sm font-extrabold text-white shadow-[0_3px_0_#123F80] active:translate-y-0.5 active:shadow-[0_1px_0_#123F80]"
      >
        {mine ? "Play" : "Join"}
      </button>
      {/* Points at the spot. */}
      <span className="absolute top-full left-1/2 -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-surface" aria-hidden />
    </div>
  );
}
