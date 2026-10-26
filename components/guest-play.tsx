"use client";

import { useEffect, useRef, useState } from "react";
import { MenuHint, MenuPanel, MenuRow, setPill, StatsPill } from "@/components/play-ui";
import { StreamVideo } from "@/components/stream-video";
import type { GuestSession, GuestSnapshot } from "@/lib/guest/session";
import { useGameMode, useNavAction } from "@/lib/nav/react";

/** Fullscreen stream for players and spectators alike. */
export function GuestPlay({
  session,
  snap,
  onLobby,
}: {
  session: GuestSession;
  snap: GuestSnapshot;
  onLobby: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const playing = snap.slot > 0;

  useGameMode(!menuOpen);
  useNavAction("start", () => setMenuOpen((open) => !open));

  // Pill: RTT from our pings and decoded fps from the receiver, once a second.
  useEffect(() => {
    const id = setInterval(async () => {
      let fps: number | null = null;
      const stats = await session.pc?.getStats();
      stats?.forEach((s) => {
        if (s.type === "inbound-rtp" && s.kind === "video" && s.framesPerSecond) fps = s.framesPerSecond;
      });
      setPill(pillRef.current, session.rttMs || null, fps);
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  const resume = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setMenuOpen(false);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-game-bg">
      <div inert={menuOpen} className="absolute inset-0 flex items-center justify-center p-6">
        {snap.stream ? (
          <StreamVideo
            stream={snap.stream}
            className={`aspect-[8/7] h-full max-h-full max-w-full rounded-lg object-contain ${menuOpen ? "opacity-55" : ""}`}
          />
        ) : (
          <p className="text-sm font-bold text-[#77777F]">
            {snap.status === "ended" ? "The host ended the session." : "Waiting for the host to start a game"}
          </p>
        )}
        <StatsPill ref={pillRef} />
        <span className="absolute top-6 right-6 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold">
          {playing ? `Player ${snap.slot}` : snap.claiming ? "Joining" : "Watching"}
        </span>
        <MenuHint show={!menuOpen} />
      </div>

      {menuOpen && (
        <MenuPanel
          system={snap.game?.system ?? ""}
          title={snap.game?.title ?? "Waiting for the host"}
          players={snap.players}
          spectators={snap.spectators}
          onBack={resume}
        >
          <MenuRow onClick={resume} isDefault>
            Resume
          </MenuRow>
          {playing ? (
            <MenuRow
              onClick={() => {
                session.watch();
                resume();
              }}
            >
              Just watch
            </MenuRow>
          ) : (
            <MenuRow
              onClick={() => {
                session.claim("gamepad");
                resume();
              }}
            >
              Join as a player
            </MenuRow>
          )}
          <MenuRow onClick={onLobby}>Back to lobby</MenuRow>
        </MenuPanel>
      )}
    </div>
  );
}
