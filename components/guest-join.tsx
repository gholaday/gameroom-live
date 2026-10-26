"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Gamepad2 } from "lucide-react";
import { GuestPlay } from "@/components/guest-play";
import { StreamVideo } from "@/components/stream-video";
import { Avatar, Dot, EmptySlot, Footer, Hint, type PlayerSlot } from "@/components/ui";
import { GuestSession, type InputMode } from "@/lib/guest/session";
import { useAnyGamepadButton, useInitialFocus, useNavAction } from "@/lib/nav/react";

const SLOTS: PlayerSlot[] = [1, 2, 3, 4];

export function GuestJoin({ code }: { code: string }) {
  const [session] = useState(() => new GuestSession(code));
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [view, setView] = useState<"lobby" | "play">("lobby");
  const [note, setNote] = useState<string | null>(null);
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
  const play = (mode: InputMode) => {
    session.claim(mode);
    setView("play");
  };
  const watch = () => {
    session.watch();
    setView("play");
  };

  useInitialFocus(view === "lobby");
  useAnyGamepadButton(() => play("gamepad"), connected && view === "lobby");
  useNavAction("back", watch, connected && view === "lobby");

  if (view === "play") {
    return <GuestPlay session={session} snap={snap} onLobby={() => setView("lobby")} />;
  }

  const taken = new Set(snap.players.map((p) => p.slot));
  const mySlot = snap.slot || (SLOTS.find((s) => !taken.has(s)) ?? 0);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center gap-[30px] px-4 pt-11 pb-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-bold text-text-muted">
            {connected ? `${snap.hostName} invited you to play` : `Room ${code}`}
          </span>
          <h1 className="text-[34px] font-extrabold">{snap.game?.title ?? "Waiting for the host"}</h1>
        </div>

        <div className="relative flex aspect-[8/7] w-full max-w-[520px] items-center justify-center overflow-hidden rounded-card bg-text text-[13px] text-[#C9C9CF] shadow-stream">
          {snap.stream ? (
            <StreamVideo stream={snap.stream} muted className="h-full w-full object-contain" />
          ) : (
            <span>{statusText(snap.status, snap.error)}</span>
          )}
          {snap.stream && (
            <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-[5px] text-xs font-extrabold text-text">
              <Dot className="bg-live" size={8} />
              Live
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-[34px]">
          {SLOTS.map((slot) => {
            if (slot === mySlot && connected) {
              return (
                <GuestSlot key={slot} slot={slot} claimed={!!snap.slot} claiming={snap.claiming} onJoin={() => play("gamepad")} />
              );
            }
            const p = snap.players.find((pl) => pl.slot === slot);
            return (
              <div key={slot} className="flex w-24 flex-col items-center gap-2.5">
                {p ? <Avatar slot={slot} name={p.name} size={84} /> : <EmptySlot size={84} />}
                <span className={`text-sm ${p ? "font-extrabold" : "font-bold text-text-muted"}`}>
                  {p ? p.name : "Open"}
                </span>
                {p && <span className="-mt-2 text-xs font-semibold text-text-muted">Player {slot}</span>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <PillButton disabled={!connected} onClick={() => setNote("Touch controls arrive in the next milestone.")}>
            Touch controls
          </PillButton>
          <PillButton disabled={!connected} onClick={() => play("keyboard")}>
            Keyboard
          </PillButton>
          <button
            type="button"
            disabled={!connected}
            onClick={watch}
            className="ring-row min-h-12 rounded-full px-[18px] text-sm font-extrabold text-primary-text disabled:opacity-50"
          >
            Just watch
          </button>
        </div>
        {note && (
          <p role="status" className="text-sm font-bold text-text-muted">
            {note}
          </p>
        )}
      </main>

      <Footer
        status={
          <span className="inline-flex items-center gap-2 font-bold">
            <Dot className={connected ? "bg-ok" : snap.status === "connecting" ? "bg-slot-empty" : "bg-danger"} />
            {connected ? "Connected" : statusText(snap.status, snap.error)}
            <span ref={rttRef} className="text-text" />
            {snap.spectators > 0 && <span>{snap.spectators} watching</span>}
          </span>
        }
        hints={
          <>
            <Hint button="A">Join</Hint>
            <Hint button="B">Just watch</Hint>
          </>
        }
      />
    </div>
  );
}

function statusText(status: string, error: string | null) {
  if (status === "connecting") return "Connecting to the room";
  if (status === "ended") return "The host ended the session.";
  if (status === "error") return error ?? "Could not connect.";
  return "Waiting for the host to start a game";
}

function GuestSlot({
  slot,
  claimed,
  claiming,
  onJoin,
}: {
  slot: PlayerSlot;
  claimed: boolean;
  claiming: boolean;
  onJoin: () => void;
}) {
  return (
    <div className="flex w-[120px] flex-col items-center gap-2.5">
      <button
        type="button"
        onClick={onJoin}
        data-nav-default=""
        aria-label={claimed ? `You are Player ${slot}` : "Join as a player"}
        className="ring-tile rounded-full"
      >
        {claimed ? (
          <Avatar slot={slot} name="You" size={84} />
        ) : (
          <span className="slot-pulse box-border flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-focus bg-surface text-primary-text">
            <Gamepad2 size={34} strokeWidth={2} aria-hidden />
          </span>
        )}
      </button>
      <span className="text-sm font-extrabold text-primary-text">You</span>
      <span role="status" className="-mt-2 text-center text-xs font-bold text-primary-text">
        {claimed ? `Player ${slot}` : claiming ? "Joining" : "Press any button"}
      </span>
    </div>
  );
}

function PillButton({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ring-row min-h-12 rounded-full bg-surface px-[22px] text-sm font-extrabold text-text shadow-soft disabled:opacity-50"
    >
      {children}
    </button>
  );
}
