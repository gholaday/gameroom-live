"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { OverlayLayer } from "@/components/overlay-layer";
import { SaveSlots } from "@/components/save-slots";
import { MenuHint, MenuNote, MenuPanel, MenuRow, setPill, StatsPill, useMenu } from "@/components/play-ui";
import { hostSession } from "@/lib/host/session";
import { useGameMode, useInitialFocus, useNavAction } from "@/lib/nav/react";
import { Check, Copy } from "lucide-react";
import { useOrigin } from "@/lib/use-origin";

export function HostPlay() {
  const router = useRouter();
  const snap = useSyncExternalStore(hostSession.subscribe, hostSession.getSnapshot, hostSession.getSnapshot);
  // The canvas belongs to the session (see getCanvas); this screen only shows it.
  const [canvasRef] = useState(() => ({ current: hostSession.getCanvas() }));
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const menu = useMenu();
  const menuOpen = menu.open;
  const [error, setError] = useState<string | null>(null);
  const origin = useOrigin();
  // After a refresh straight into /play, booting needs a click first, or the
  // game's AudioContext starts suspended.
  const [ready, setReady] = useState(() => typeof navigator === "undefined" || navigator.userActivation?.hasBeenActive !== false);

  // A refresh lands here with no session: reopen the same room and the saved game.
  useEffect(() => {
    void hostSession.restore();
    void hostSession.open();
  }, []);

  useGameMode(!menuOpen && snap.running);
  useNavAction("start", menu.toggle, snap.running);

  // Attach the session's canvas before children's effects (the overlay) measure it.
  // Next keeps this screen mounted (hidden) across routes, and ending a session
  // makes a new canvas, so take the session's current one each time the game changes.
  const rom = snap.rom;
  useLayoutEffect(() => {
    const box = frameBoxRef.current;
    const canvas = (canvasRef.current = hostSession.getCanvas());
    if (!box || !canvas || !rom) return;
    canvas.className = "h-full w-full object-contain [image-rendering:pixelated] transition-opacity";
    box.prepend(canvas);
    return () => canvas.remove();
  }, [canvasRef, rom]);
  useEffect(() => {
    canvasRef.current?.classList.toggle("opacity-55", menuOpen);
  }, [canvasRef, menuOpen]);

  // Boot once. Coming back from the home screen finds it running.
  useEffect(() => {
    if (!snap.rom || !ready) return;
    hostSession.boot().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [snap.rom, ready]);

  // Leaving this screen pauses the game; being on it runs it. The menu doesn't pause.
  useEffect(() => {
    if (snap.running) hostSession.resume();
  }, [snap.running]);
  useEffect(() => () => hostSession.pause(), []);

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

  if (!snap.rom && !snap.restored) return <div className="fixed inset-0 bg-game-bg" />;
  if (!snap.rom) return <NoGame onHome={() => router.push("/")} />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-game-bg">
      {/* Framebuffer size is pinned; CSS scales it to fit. The canvas is prepended here. */}
      <div ref={frameBoxRef} inert={menuOpen} className="absolute inset-0 flex items-center justify-center p-6">
        {snap.running && (
          <OverlayLayer frameRef={canvasRef} attach={(o) => hostSession.attachOverlay(o)} sink={hostSession.overlaySink} />
        )}
        {!ready && <ContinueButton title={snap.rom.game.title} onClick={() => setReady(true)} />}
        <StatsPill ref={pillRef} />
        <MenuHint show={!menuOpen && snap.running} />
        {error && (
          <p className="absolute bottom-16 rounded-full bg-white/92 px-4 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        )}
      </div>

      {menu.shown && (
        <HostMenu
          closing={menu.closing}
          onClosed={menu.onClosed}
          system={snap.rom.game.system}
          title={snap.rom.game.title}
          players={snap.players}
          spectators={snap.spectators}
          inviteLink={snap.code ? `${origin}/r/${snap.code}` : null}
          onResume={menu.close}
          onEnd={end}
        />
      )}
    </div>
  );
}

const listSlots = () => hostSession.listSlots();
const isHostRow = (p: { isHost?: boolean }) => !!p.isHost;

function HostMenu({
  system,
  title,
  players,
  spectators,
  inviteLink,
  onResume,
  onEnd,
  closing,
  onClosed,
}: {
  closing: boolean;
  onClosed: () => void;
  system: string;
  title: string;
  players: Parameters<typeof MenuPanel>[0]["players"];
  spectators: number;
  inviteLink: string | null;
  onResume: () => void;
  onEnd: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [slots, setSlots] = useState<"save" | "load" | null>(null);
  const [copied, setCopied] = useState(false);
  const copyInvite = async () => {
    if (!inviteLink) return setNote("The room isn't open yet.");
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setNote(`Copied ${inviteLink.replace(/^https?:\/\//, "")}`);
    } catch {
      setNote(`Couldn't copy. Share ${inviteLink.replace(/^https?:\/\//, "")}`);
    }
  };
  const resume = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onResume();
  };
  return (
    <MenuPanel
      system={system}
      title={title}
      players={players}
      spectators={spectators}
      onBack={resume}
      closing={closing}
      onClosed={onClosed}
      isSelf={isHostRow}
      onRename={(n) => hostSession.setHostName(n)}
    >
      {slots ? (
        <SaveSlots
          mode={slots}
          list={listSlots}
          onPick={async (slot) => {
            if (slots === "save") return hostSession.saveSlot(slot);
            await hostSession.loadSlot(slot);
            resume();
          }}
          onBack={() => setSlots(null)}
        />
      ) : (
        <>
          <MenuRow onClick={resume} isDefault>
            Resume
          </MenuRow>
          <MenuRow onClick={() => setSlots("save")}>Save state</MenuRow>
          <MenuRow onClick={() => setSlots("load")}>Load state</MenuRow>
          <MenuRow
            onClick={() => void copyInvite()}
            icon={copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />}
          >
            {copied ? "Link copied" : "Invite friends"}
          </MenuRow>
          <MenuRow onClick={onEnd} danger>
            End session
          </MenuRow>
          {note && <MenuNote>{note}</MenuNote>}
        </>
      )}
    </MenuPanel>
  );
}

function ContinueButton({ title, onClick }: { title: string; onClick: () => void }) {
  useInitialFocus();
  return (
    <button
      type="button"
      data-nav-default=""
      onClick={onClick}
      className="ring-row absolute min-h-14 rounded-full bg-surface px-7 text-base font-extrabold text-text shadow-lift"
    >
      Continue {title}
    </button>
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
