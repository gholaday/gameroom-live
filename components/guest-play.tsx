"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OverlayLayer } from "@/components/overlay-layer";
import { LatencyBreakdown, MenuHint, MenuPanel, MenuRow, setBreakdown, setPill, StatsPill, useMenu } from "@/components/play-ui";
import { statusText } from "@/components/guest-join";
import { StreamVideo } from "@/components/stream-video";
import { TouchPad } from "@/components/touch-pad";
import { SYSTEMS } from "@/lib/emulator/systems";
import type { GuestSession, GuestSnapshot } from "@/lib/guest/session";
import { estimateLatency, perFrameMs } from "@/lib/net/latency";
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
  const menu = useMenu();
  const menuOpen = menu.open;
  const pillRef = useRef<HTMLSpanElement>(null);
  const breakdownRef = useRef<HTMLDListElement>(null);
  const [details, setDetails] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = snap.slot > 0;
  const touch = playing && session.inputMode === "touch";
  const onTouch = useCallback((mask: number) => session.setTouchButtons(mask), [session]);

  useGameMode(!menuOpen);
  useNavAction("start", menu.toggle);

  // Pill: estimated input-to-screen latency and decoded fps, once a second,
  // straight to the DOM. Buffer and decode times are per-frame deltas.
  useEffect(() => {
    let prev = { buf: 0, emitted: 0, dec: 0, decoded: 0 };
    const id = setInterval(async () => {
      let fps: number | null = null;
      let bufferMs = 0;
      let decodeMs = 0;
      const stats = await session.pc?.getStats();
      stats?.forEach((s) => {
        if (s.type !== "inbound-rtp" || s.kind !== "video") return;
        if (s.framesPerSecond) fps = s.framesPerSecond;
        const now = { buf: s.jitterBufferDelay ?? 0, emitted: s.jitterBufferEmittedCount ?? 0, dec: s.totalDecodeTime ?? 0, decoded: s.framesDecoded ?? 0 };
        bufferMs = perFrameMs(now.buf, now.emitted, prev.buf, prev.emitted);
        decodeMs = perFrameMs(now.dec, now.decoded, prev.dec, prev.decoded);
        prev = now;
      });
      const rttMs = session.rttMs;
      if (!rttMs) return setPill(pillRef.current, null, fps);
      const est = estimateLatency({ rttMs, encodeMs: session.encodeMs, bufferMs, decodeMs, frameMs: 1000 / 60 });
      setPill(pillRef.current, rttMs, fps, `~${est.total} ms`);
      setBreakdown(breakdownRef.current, est);
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  const resume = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    menu.close();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-game-bg">
      <div
        inert={menuOpen}
        // With the touch pad, the picture sits at the top, clear of the thumbs.
        className={`absolute inset-0 flex justify-center p-6 items-center ${touch ? "portrait:items-start portrait:pt-[72px]" : ""}`}
      >
        {snap.stream ? (
          <>
            <StreamVideo
              ref={videoRef}
              stream={snap.stream}
              soundAtTop={touch}
              className={`h-full w-full object-contain ${touch ? "portrait:h-auto portrait:max-h-[55%]" : ""} ${menuOpen ? "opacity-55" : ""}`}
            />
            <OverlayLayer
              frameRef={videoRef}
              attach={(o) => session.attachOverlay(o)}
              sink={session.overlaySink}
              interactive={!touch}
            />
          </>
        ) : (
          <p className="text-sm font-bold text-[#77777F]">
            {statusText(snap.status, snap.error)}
          </p>
        )}
        <StatsPill ref={pillRef} onClick={() => setDetails((d) => !d)} expanded={details} />
        {details && <LatencyBreakdown ref={breakdownRef} />}
        <span className="absolute top-6 right-6 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold">
          {playing ? `Player ${snap.slot}` : snap.claiming ? "Joining" : "Watching"}
        </span>
        <MenuHint show={!menuOpen && !touch} />
        {touch && !menuOpen && (
          <>
            <button
              type="button"
              onClick={menu.openMenu}
              className="absolute top-6 left-1/2 z-20 min-h-9 -translate-x-1/2 rounded-full bg-white/92 px-4 text-[13px] font-extrabold"
            >
              Menu
            </button>
            <TouchPad system={SYSTEMS[snap.game?.systemId ?? "snes"]} onChange={onTouch} />
          </>
        )}
      </div>

      {menu.shown && (
        <MenuPanel
          closing={menu.closing}
          onClosed={menu.onClosed}
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
            (snap.game?.maxPlayers ?? 2) > 1 && (
              <MenuRow
                onClick={() => {
                  session.claim(session.inputMode);
                  resume();
                }}
              >
                Join as a player
              </MenuRow>
            )
          )}
          <MenuRow onClick={onLobby}>Back to lobby</MenuRow>
        </MenuPanel>
      )}
    </div>
  );
}
