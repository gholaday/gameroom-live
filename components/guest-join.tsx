"use client";

import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { Avatar, Dot, EmptySlot, Footer, Hint } from "@/components/ui";
import { GAMES, HOST_NAME, PLAYERS, type PlayerSlot } from "@/lib/fake-data";
import { useAnyGamepadButton, useInitialFocus, useNavAction } from "@/lib/nav/react";

type Mode = "waiting" | "gamepad" | "touch" | "keyboard" | "watching";

const FAKE_RTT = 31;
const GUEST_SLOT: PlayerSlot = 3;

const MODE_LABEL: Record<Mode, string> = {
  waiting: "Press any button",
  gamepad: "Controller",
  touch: "Touch controls",
  keyboard: "Keyboard",
  watching: "Watching",
};

export function GuestJoin({ code }: { code: string }) {
  const game = GAMES[0];
  const [mode, setMode] = useState<Mode>("waiting");
  const joined = mode === "gamepad" || mode === "touch" || mode === "keyboard";

  useInitialFocus();
  useAnyGamepadButton(() => setMode("gamepad"), mode === "waiting");
  useNavAction("back", () => setMode("watching"));

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center gap-[30px] px-4 pt-11 pb-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-bold text-text-muted">{HOST_NAME} invited you to play</span>
          <h1 className="text-[34px] font-extrabold">{game.title}</h1>
          <span className="sr-only">Room {code}</span>
        </div>

        {/* Placeholder for the host's live <video> stream. */}
        <div className="relative flex aspect-[4/3] w-full max-w-[520px] items-center justify-center rounded-card bg-text text-[13px] text-[#C9C9CF] shadow-stream">
          Live stream preview
          <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-[5px] text-xs font-extrabold text-text">
            <Dot className="bg-live" size={8} />
            Live
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-[34px]">
          {([1, 2, 3, 4] as PlayerSlot[]).map((slot) => {
            if (slot === GUEST_SLOT) {
              return (
                <GuestSlot
                  key={slot}
                  mode={mode}
                  joined={joined}
                  onJoin={() => setMode(joined ? mode : "gamepad")}
                />
              );
            }
            const p = PLAYERS.find((pl) => pl.slot === slot);
            return (
              <div key={slot} className="flex w-24 flex-col items-center gap-2.5">
                {p ? <Avatar slot={slot} name={p.name} size={84} /> : <EmptySlot size={84} />}
                <span className={`text-sm ${p ? "font-extrabold" : "font-bold text-text-muted"}`}>
                  {p ? p.name : "Open"}
                </span>
                {p && (
                  <span className="-mt-2 text-xs font-semibold text-text-muted">Player {slot}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <PillButton onClick={() => setMode("touch")}>Touch controls</PillButton>
          <PillButton onClick={() => setMode("keyboard")}>Keyboard</PillButton>
          <button
            type="button"
            onClick={() => setMode("watching")}
            className="ring-row min-h-12 rounded-full px-[18px] text-sm font-extrabold text-primary-text"
          >
            Just watch
          </button>
        </div>
      </main>

      <Footer
        status={
          <span className="inline-flex items-center gap-2 font-bold">
            <Dot />
            Connected
            <span className="text-text">{FAKE_RTT} ms</span>
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

function GuestSlot({ mode, joined, onJoin }: { mode: Mode; joined: boolean; onJoin: () => void }) {
  return (
    <div className="flex w-[120px] flex-col items-center gap-2.5">
      <button
        type="button"
        onClick={onJoin}
        data-nav-default=""
        aria-label={joined ? `You are Player ${GUEST_SLOT}` : "Join as a player"}
        className="ring-tile rounded-full"
      >
        {joined ? (
          <Avatar slot={GUEST_SLOT} name="You" size={84} />
        ) : (
          <span
            className={`box-border flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-focus bg-surface text-primary-text ${
              mode === "waiting" ? "slot-pulse" : "opacity-60"
            }`}
          >
            <Gamepad2 size={34} strokeWidth={2} aria-hidden />
          </span>
        )}
      </button>
      <span className="text-sm font-extrabold text-primary-text">You</span>
      <span role="status" className="-mt-2 text-center text-xs font-bold text-primary-text">
        {joined ? `Player ${GUEST_SLOT}` : MODE_LABEL[mode]}
      </span>
      {joined && (
        <span className="-mt-2 text-center text-xs font-semibold text-text-muted">{MODE_LABEL[mode]}</span>
      )}
    </div>
  );
}

function PillButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ring-row min-h-12 rounded-full bg-surface px-[22px] text-sm font-extrabold text-text shadow-soft"
    >
      {children}
    </button>
  );
}
