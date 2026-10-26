"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { FolderOpen, Gamepad2, Plus, RefreshCw, Save, Settings, UserPlus, type LucideIcon } from "lucide-react";
import { PlayersPanel, SettingsPanel } from "@/components/players-panel";
import { Avatar, Dot, EmptySlot, Footer, Hint, Pill, type PlayerSlot } from "@/components/ui";
import { hostSession } from "@/lib/host/session";
import type { LibraryEntry } from "@/lib/library/entries";
import { canPickFolder, library } from "@/lib/library/store";
import type { Game } from "@/lib/net/protocol";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";
import { useHost, useOrigin } from "@/lib/use-origin";

const SLOTS: PlayerSlot[] = [1, 2, 3, 4];

export function HostHome() {
  const router = useRouter();
  const snap = useSyncExternalStore(hostSession.subscribe, hostSession.getSnapshot, hostSession.getSnapshot);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<"players" | "settings" | null>(null);
  const togglePanel = (p: "players" | "settings") => setPanel((cur) => (cur === p ? null : p));
  const lib = useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  const host = useHost("localhost:3000");
  const origin = useOrigin("http://localhost:3000");
  const roomLink = snap.code ? `${host}/r/${snap.code}` : "Opening your room";
  const game = snap.rom?.game ?? null;

  useEffect(() => {
    void hostSession.restore();
    void hostSession.open();
    void library.load();
  }, []);

  // Dev shortcut: /?rom=<file in /roms> loads a test ROM without the picker.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const name = new URLSearchParams(window.location.search).get("rom");
    if (!name || hostSession.getSnapshot().rom) return;
    fetch(`/dev/roms/${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => hostSession.setRom(new File([blob], name)))
      .catch(() => {});
  }, []);
  useInitialFocus();

  const start = () => {
    if (snap.rom) router.push("/play");
    else setNote("Pick a game first.");
  };
  const focusInvite = () => {
    copyRef.current?.focus();
    copyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const endSession = () => {
    hostSession.end();
    void hostSession.open();
    setNote("Session ended. A new room is open.");
  };

  useNavAction("start", start);
  useNavAction("x", focusInvite);
  useNavAction("back", endSession);

  const copy = async () => {
    if (!snap.code) return;
    try {
      await navigator.clipboard.writeText(`${location.protocol}//${roomLink}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setNote("Could not copy. Select the link and copy it by hand.");
    }
  };

  const openRom = (file: File) => {
    const err = hostSession.setRom(file);
    setNote(err);
    if (!err) void library.importFiles([file]);
  };

  const playEntry = async (entry: LibraryEntry) => {
    const name = entry.path.split("/").pop();
    if (snap.rom?.file.name === name) return start();
    try {
      const err = hostSession.setRom(await library.file(entry));
      if (err) setNote(err);
      else router.push("/play");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  const openFolder = () => {
    if (canPickFolder()) void library.pickFolder();
    else folderRef.current?.click();
  };

  const guests = snap.players.length - 1;
  const status =
    note ??
    (snap.status === "error"
      ? `Room error: ${snap.error}`
      : snap.status !== "open"
        ? "Opening your room."
        : guests || snap.spectators
          ? `${guests} playing with you, ${snap.spectators} watching.`
          : "Paused and ready. Start when everyone is in.");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-10 py-[22px] max-sm:px-4">
        <div className="flex items-center gap-2.5">
          {SLOTS.map((slot) => {
            const p = snap.players.find((pl) => pl.slot === slot);
            return p ? (
              <Avatar key={slot} slot={slot} name={p.name} className="shadow-[0_0_0_3px_#fff]" />
            ) : (
              <EmptySlot key={slot} label={`Player ${slot} open`} />
            );
          })}
        </div>
        <div className="flex items-center gap-2.5">
          <Pill>
            <Dot className={snap.status === "open" ? "bg-ok" : snap.status === "error" ? "bg-danger" : "bg-slot-empty"} />
            Hosting
          </Pill>
          <Pill className="text-text-muted">{snap.code ? `Room ${snap.code}` : "No room yet"}</Pill>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-[34px] px-10 pt-[18px] pb-[30px] max-sm:px-4">
        <section className="flex flex-col gap-3.5" aria-label="Games">
          <div className="flex items-baseline gap-3.5">
            <h1 className="text-[26px] font-extrabold text-primary-text">
              {game?.title ?? (lib.entries.length ? "Pick a game" : "Open your ROM folder to start")}
            </h1>
            {game && (
              <span className="text-sm font-bold text-text-muted">
                {snap.running ? "Playing now" : snap.resuming ? "Continues where you left off" : game.system}
              </span>
            )}
          </div>
          <div className="flex items-end gap-[22px] overflow-x-auto p-3 [scrollbar-width:none]">
            {game && <GameTile game={game} large onClick={start} />}
            {lib.entries
              .filter((e) => !snap.rom || e.path.split("/").pop() !== snap.rom.file.name)
              .map((entry) => (
                <GameTile
                  key={entry.path}
                  game={{ title: entry.title, system: "Super Nintendo" }}
                  isDefault={false}
                  onClick={() => void playEntry(entry)}
                />
              ))}
            {lib.needsPermission && (
              <ActionTile icon={RefreshCw} onClick={() => void library.reconnect().catch((e) => setNote(String(e.message ?? e)))}>
                Reconnect {lib.folderName}
              </ActionTile>
            )}
            <ActionTile icon={FolderOpen} onClick={openFolder} isDefault={!game && !lib.entries.length}>
              {lib.folderName ? "Change folder" : "Open ROM folder"}
            </ActionTile>
            <ActionTile icon={Plus} onClick={() => fileRef.current?.click()}>
              Open ROM file
            </ActionTile>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".sfc,.smc"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) openRom(file);
                e.target.value = "";
              }}
            />
            <input
              ref={folderRef}
              type="file"
              hidden
              {...{ webkitdirectory: "" }}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void library.importFiles(files).then((n) => setNote(n ? `Added ${n} games.` : "No SNES ROMs in that folder."));
              }}
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-7">
          <div className="flex flex-wrap gap-[22px]">
            <Shortcut icon={UserPlus} label="Invite" ariaLabel="Invite friends" color="text-primary-text" onClick={focusInvite} />
            <Shortcut icon={Gamepad2} label="Players" color="text-p2" onClick={() => togglePanel("players")} />
            <Shortcut icon={Save} label="Saves" ariaLabel="Save states" color="text-p3" onClick={() => setNote("Saves are coming soon.")} />
            <Shortcut icon={Settings} label="Settings" color="text-text-muted" onClick={() => togglePanel("settings")} />
          </div>

          <section
            aria-label="Invite friends"
            className="flex min-w-0 flex-[0_1_460px] items-center gap-4 max-sm:flex-auto max-sm:w-full rounded-card bg-surface p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
          >
            <QRCodeSVG
              value={`${origin}/r/${snap.code ?? ""}`}
              size={88}
              fgColor="#2B2B2E"
              className="flex-none"
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-base font-extrabold">Invite friends</span>
              <label htmlFor="room-link" className="text-[13px] font-semibold text-text-muted">
                Scan the code or share the link
              </label>
              <div className="flex gap-2">
                <input
                  id="room-link"
                  readOnly
                  value={roomLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="ring-row min-h-11 min-w-0 flex-1 rounded-full border-none bg-bg px-3.5 text-[13px] font-bold text-text"
                />
                <button
                  ref={copyRef}
                  type="button"
                  onClick={copy}
                  className="ring-row min-h-11 rounded-full bg-primary-text px-[18px] text-sm font-extrabold text-white"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </section>
        </div>

        {panel === "players" && (
          <PlayersPanel
            hostName={snap.hostName}
            guests={snap.guests}
            onSlot={(id, slot) => hostSession.setSlot(id, slot)}
            onKick={(id) => hostSession.kick(id)}
          />
        )}
        {panel === "settings" && <SettingsPanel name={snap.hostName} onName={(n) => hostSession.setHostName(n)} />}
      </main>

      <Footer
        status={<span role="status">{status}</span>}
        hints={
          <>
            <Hint button="A">Start</Hint>
            <Hint button="X">Invite</Hint>
            <Hint button="B">End session</Hint>
          </>
        }
      />
    </div>
  );
}

function GameTile({
  game,
  onClick,
  large,
  isDefault = true,
}: {
  game: Game;
  onClick: () => void;
  large?: boolean;
  isDefault?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${game.title}, ${game.system}`}
      data-nav-default={isDefault ? "" : undefined}
      className={`ring-tile flex flex-none flex-col overflow-hidden rounded-tile bg-surface p-0 text-left shadow-lift ${
        large ? "h-[250px] w-[250px]" : "h-[210px] w-[210px]"
      }`}
    >
      <BoxArt game={game} />
      <span className="truncate px-3.5 py-2.5 text-sm font-bold text-text">{game.title}</span>
    </button>
  );
}

const ART_COLORS = ["#E5603F", "#1F9E89", "#7A5AF0", "#E0A21B", "#1A5FC0"];

/** Placeholder cover until real box art exists. */
function BoxArt({ game }: { game: Game }) {
  let hash = 0;
  for (const ch of game.title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = ART_COLORS[hash % ART_COLORS.length];
  const initials = game.title
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 3)
    // Keep numbers whole so "Mario Kart 64" reads MK64.
    .map((w) => (/^\d/.test(w) ? w : w[0]))
    .join("");
  return (
    <span
      aria-hidden
      className="flex flex-1 items-center justify-center text-5xl font-extrabold text-white/90"
      style={{ background: `linear-gradient(135deg, ${color}, #2B2B2E)` }}
    >
      {initials}
    </span>
  );
}

function ActionTile({
  icon: Icon,
  children,
  onClick,
  isDefault,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick: () => void;
  isDefault?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-default={isDefault ? "" : undefined}
      className="ring-tile box-border flex h-[210px] w-[210px] flex-none flex-col items-center justify-center gap-2.5 rounded-tile border-2 border-dashed border-slot-empty bg-transparent px-4 text-center font-bold text-text"
    >
      <Icon size={36} strokeWidth={2} aria-hidden />
      {children}
    </button>
  );
}

function Shortcut({
  icon: Icon,
  label,
  ariaLabel,
  color,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  ariaLabel?: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        onClick={onClick}
        className={`ring-tile flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-soft ${color}`}
      >
        <Icon size={26} strokeWidth={2} aria-hidden />
      </button>
      <span className="text-[13px] font-bold">{label}</span>
    </div>
  );
}
