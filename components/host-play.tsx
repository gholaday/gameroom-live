"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { OverlayLayer } from "@/components/overlay-layer";
import { MenuHint, MenuNote, MenuPanel, MenuRow, setPill, StatsPill } from "@/components/play-ui";
import { hostSession, STREAM_SIZE } from "@/lib/host/session";
import { useGameMode, useInitialFocus, useNavAction } from "@/lib/nav/react";
import { useHost } from "@/lib/use-origin";

export function HostPlay() {
  const router = useRouter();
  const snap = useSyncExternalStore(hostSession.subscribe, hostSession.getSnapshot, hostSession.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useHost();

  useGameMode(!menuOpen && snap.running);
  useNavAction("start", () => setMenuOpen((open) => !open), snap.running);

  // Boot once. Re-mounts (e.g. coming back from the home screen) find it running.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snap.rom) return;
    hostSession.boot(canvas).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [snap.rom]);

  // The menu pauses the game for everyone.
  useEffect(() => {
    if (!snap.running) return;
    if (menuOpen) hostSession.pause();
    else hostSession.resume();
  }, [menuOpen, snap.running]);

  // Pill: worst guest RTT and outbound fps, once a second, straight to the DOM.
  useEffect(() => {
    if (!snap.running) return;
    const id = setInterval(async () => {
      const s = await hostSession.sampleStats();
      setPill(pillRef.current, s.guests ? s.rttMs : null, s.fps);
    }, 1000);
    return () => clearInterval(id);
  }, [snap.running]);

  const end = () => {
    hostSession.end();
    router.push("/");
  };

  if (!snap.rom) return <NoGame onHome={() => router.push("/")} />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-game-bg">
      <div inert={menuOpen} className="absolute inset-0 flex items-center justify-center p-6">
        {/* Framebuffer stays 512x448 (pinned); CSS scales it to fit. */}
        <canvas
          ref={canvasRef}
          width={STREAM_SIZE.width}
          height={STREAM_SIZE.height}
          className={`h-full w-full object-contain [image-rendering:pixelated] ${menuOpen ? "opacity-55" : ""}`}
        />
        {snap.running && (
          <OverlayLayer frameRef={canvasRef} attach={(o) => hostSession.attachOverlay(o)} sink={hostSession.overlaySink} />
        )}
        <StatsPill ref={pillRef} />
        <MenuHint show={!menuOpen && snap.running} />
        {error && (
          <p className="absolute bottom-16 rounded-full bg-white/92 px-4 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        )}
      </div>

      {menuOpen && (
        <HostMenu
          system={snap.rom.game.system}
          title={snap.rom.game.title}
          players={snap.players}
          spectators={snap.spectators}
          inviteText={snap.code ? `Share ${host}/r/${snap.code}` : "Room is not open."}
          onResume={() => setMenuOpen(false)}
          onEnd={end}
        />
      )}
    </div>
  );
}

function HostMenu({
  system,
  title,
  players,
  spectators,
  inviteText,
  onResume,
  onEnd,
}: {
  system: string;
  title: string;
  players: Parameters<typeof MenuPanel>[0]["players"];
  spectators: number;
  inviteText: string;
  onResume: () => void;
  onEnd: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const resume = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onResume();
  };
  return (
    <MenuPanel system={system} title={title} players={players} spectators={spectators} onBack={resume}>
      <MenuRow onClick={resume} isDefault>
        Resume
      </MenuRow>
      <MenuRow onClick={() => setNote("Save states arrive in a later milestone.")}>Save state</MenuRow>
      <MenuRow onClick={() => setNote("Save states arrive in a later milestone.")}>Load state</MenuRow>
      <MenuRow onClick={() => setNote(inviteText)}>Invite friends</MenuRow>
      <MenuRow onClick={onEnd} danger>
        End session
      </MenuRow>
      {note && <MenuNote>{note}</MenuNote>}
    </MenuPanel>
  );
}

function NoGame({ onHome }: { onHome: () => void }) {
  useInitialFocus();
  useNavAction("back", onHome);
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-game-bg text-white">
      <p className="text-lg font-bold">No game loaded. Open a ROM file on the home screen.</p>
      <button
        type="button"
        data-nav-default=""
        onClick={onHome}
        className="ring-row min-h-12 rounded-full bg-surface px-[22px] text-sm font-extrabold text-text"
      >
        Back to home
      </button>
    </div>
  );
}
