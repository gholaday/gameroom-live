"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  FolderOpen,
  Gamepad2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { ControlsPanel } from "@/components/controls-panel";
import { PlayersPanel, SettingsPanel } from "@/components/players-panel";
import { Avatar, Dot, EmptySlot, Footer, Hint, Pill, type PlayerSlot } from "@/components/ui";
import { HOST_RESERVED } from "@/lib/emulator/host-input";
import { ROM_ACCEPT, type SystemId } from "@/lib/emulator/systems";
import { hostSession } from "@/lib/host/session";
import { gameForFile } from "@/lib/library/games";
import type { LibraryEntry } from "@/lib/library/entries";
import { canPickFolder, library } from "@/lib/library/store";
import type { Game } from "@/lib/net/protocol";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";
import { useHost, useOrigin } from "@/lib/use-origin";

const SLOTS: PlayerSlot[] = [1, 2, 3, 4];

type View = "library" | "players" | "settings";

export function HostHome() {
  const router = useRouter();
  const snap = useSyncExternalStore(hostSession.subscribe, hostSession.getSnapshot, hostSession.getSnapshot);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>("library");
  const [filter, setFilter] = useState<SystemId | "all">("all");
  const lib = useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  const host = useHost("localhost:3000");
  const origin = useOrigin("http://localhost:3000");
  const roomLink = snap.code ? `${host}/r/${snap.code}` : "Opening your room";
  const game = snap.rom?.game ?? null;

  // Library entries with their game info, alphabetical. Unknown files are dropped.
  const games = useMemo(
    () =>
      lib.entries
        .flatMap((entry) => {
          const name = entry.path.split("/").pop()!;
          const found = gameForFile(name);
          return found ? [{ entry, name, game: found.game }] : [];
        })
        .sort((a, b) => a.game.title.localeCompare(b.game.title)),
    [lib.entries],
  );
  const systems = useMemo(() => {
    const seen = new Map<SystemId, string>();
    for (const g of games) seen.set(g.game.systemId as SystemId, g.game.system);
    return [...seen];
  }, [games]);
  const shown = filter === "all" || !systems.some(([id]) => id === filter) ? games : games.filter((g) => g.game.systemId === filter);

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
    if (view !== "library") return setView("library");
    hostSession.end();
    void hostSession.open();
    setNote("Session ended. A new room is open.");
  };
  const toggleView = (v: View) => setView((cur) => (cur === v ? "library" : v));

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

  const playEntry = async (entry: LibraryEntry, name: string) => {
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
  const reconnect = () => void library.reconnect().catch((e) => setNote(String(e.message ?? e)));

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
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-none flex-wrap items-center justify-between gap-4 px-10 py-[22px] max-sm:px-4">
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

      <main className="mx-auto grid w-full max-w-[1480px] flex-1 gap-x-8 gap-y-6 px-10 max-sm:px-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: the library, or the view an option opened. Scrolls on its own on wide screens. */}
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:overflow-y-auto lg:pr-2 [scrollbar-gutter:stable]">
          {view === "library" ? (
            <section aria-labelledby="library-title" className="flex flex-col gap-4 pb-8">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-1">
                <div className="flex items-baseline gap-3">
                  <h1 id="library-title" className="text-[26px] font-extrabold">
                    Library
                  </h1>
                  {games.length > 0 && (
                    <span className="text-sm font-bold text-text-muted">
                      {lib.folderName ? `${games.length} in ${lib.folderName}` : `${games.length} games`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {lib.needsPermission && (
                    <ToolButton icon={RefreshCw} onClick={reconnect}>
                      Reconnect {lib.folderName}
                    </ToolButton>
                  )}
                  {games.length > 0 && (
                    <ToolButton icon={FolderOpen} onClick={openFolder}>
                      {lib.folderName ? "Change folder" : "Add folder"}
                    </ToolButton>
                  )}
                  <ToolButton icon={Plus} onClick={() => fileRef.current?.click()}>
                    Open file
                  </ToolButton>
                </div>
              </div>

              {systems.length > 1 && (
                <div role="tablist" aria-label="System" className="flex flex-wrap gap-2">
                  <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
                    All
                  </Chip>
                  {systems.map(([id, name]) => (
                    <Chip key={id} selected={filter === id} onClick={() => setFilter(id)}>
                      {name}
                    </Chip>
                  ))}
                </div>
              )}

              {games.length ? (
                // Padding leaves room for the focus ring inside the scroll area.
                <ul className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(164px,1fr))] gap-x-5 gap-y-6 p-2">
                  {shown.map(({ entry, name, game: g }, i) => (
                    <li key={entry.path}>
                      <GameTile
                        game={g}
                        current={snap.rom?.file.name === name}
                        isDefault={!game && i === 0}
                        onClick={() => void playEntry(entry, name)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyLibrary
                  folderName={lib.needsPermission ? null : lib.folderName}
                  onFolder={openFolder}
                  isDefault={!game}
                />
              )}
            </section>
          ) : (
            <section aria-labelledby="view-title" className="flex flex-col gap-4 pb-8">
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setView("library")}
                  aria-label="Back to library"
                  className="ring-row flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface shadow-soft"
                >
                  <ArrowLeft size={20} aria-hidden />
                </button>
                <h1 id="view-title" className="text-[26px] font-extrabold">
                  {view === "players" ? "Players" : "Settings"}
                </h1>
              </div>
              {view === "players" ? (
                <PlayersPanel
                  hostName={snap.hostName}
                  guests={snap.guests}
                  slots={hostSession.guestSlots()}
                  onSlot={(id, slot) => hostSession.setSlot(id, slot)}
                  onKick={(id) => hostSession.kick(id)}
                />
              ) : (
                <>
                  <SettingsPanel name={snap.hostName} onName={(n) => hostSession.setHostName(n)} />
                  <ControlsPanel reserved={HOST_RESERVED} note="Changes apply from the next game you start." />
                </>
              )}
            </section>
          )}
        </div>

        {/* Right: what's loaded, the invite, and options. */}
        <aside className="flex flex-col gap-4 pb-8 lg:min-h-0 lg:overflow-y-auto [scrollbar-width:none]">
          <NowPlaying
            game={game}
            label={snap.running ? "Playing now" : snap.resuming ? "Continues where you left off" : "Ready to start"}
            onStart={start}
          />

          <section aria-label="Invite friends" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div className="flex items-center gap-4">
              <div className="flex-none rounded-xl bg-bg p-2">
                <QRCodeSVG value={`${origin}/r/${snap.code ?? ""}`} size={96} fgColor="#2B2B2E" bgColor="transparent" aria-hidden />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-base font-extrabold">Invite friends</span>
                <label htmlFor="room-link" className="text-[13px] font-semibold text-text-muted">
                  Scan the code or send the link. No account or download needed.
                </label>
              </div>
            </div>
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
                className="ring-row inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full bg-primary-text px-4 text-sm font-extrabold text-white"
              >
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </section>

          <nav aria-label="Options" className="flex flex-col rounded-card bg-surface p-1.5 shadow-soft">
            <OptionRow
              icon={Gamepad2}
              color="text-p2"
              selected={view === "players"}
              detail={guests ? `${guests} joined` : "Seats and kicks"}
              onClick={() => toggleView("players")}
            >
              Players
            </OptionRow>
            <OptionRow
              icon={Save}
              color="text-p3"
              detail="From the in-game menu"
              onClick={() => setNote("Save and load states from the in-game menu: Esc, Home, or Select+Start.")}
            >
              Saves
            </OptionRow>
            <OptionRow
              icon={Settings}
              color="text-text-muted"
              selected={view === "settings"}
              detail="Name and controls"
              onClick={() => toggleView("settings")}
            >
              Settings
            </OptionRow>
          </nav>
        </aside>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept={ROM_ACCEPT}
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
            void library.importFiles(files).then((n) => setNote(n ? `Added ${n} games.` : "No ROMs in that folder."));
          }}
        />
      </main>

      <Footer
        status={<span role="status">{status}</span>}
        hints={
          <>
            <Hint button="A">{game ? "Start" : "Select"}</Hint>
            <Hint button="X">Invite</Hint>
            <Hint button="B">{view === "library" ? "End session" : "Back"}</Hint>
          </>
        }
      />
    </div>
  );
}

function NowPlaying({ game, label, onStart }: { game: Game | null; label: string; onStart: () => void }) {
  if (!game)
    return (
      <section aria-label="Now playing" className="flex flex-col gap-1 rounded-card border-2 border-dashed border-line px-4 py-5">
        <span className="text-base font-extrabold">Nothing loaded</span>
        <span className="text-[13px] font-semibold text-text-muted">Pick a game from your library to start the room.</span>
      </section>
    );
  return (
    <section aria-label="Now playing" className="flex gap-4 rounded-card bg-surface p-3 shadow-soft">
      <span className="flex h-[112px] w-[112px] flex-none overflow-hidden rounded-tile">
        <BoxArt game={game} small />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-extrabold tracking-wide text-primary-text uppercase">{label}</span>
          <span className="line-clamp-2 text-lg leading-tight font-extrabold">{game.title}</span>
          <span className="text-[13px] font-bold text-text-muted">{game.system}</span>
        </div>
        <button
          type="button"
          onClick={onStart}
          data-nav-default=""
          className="ring-row inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-full bg-primary-text px-5 text-sm font-extrabold text-white"
        >
          <Play size={15} fill="currentColor" aria-hidden />
          Start
        </button>
      </div>
    </section>
  );
}

function GameTile({
  game,
  onClick,
  current,
  isDefault,
}: {
  game: Game;
  onClick: () => void;
  current: boolean;
  isDefault: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${game.title}, ${game.system}${current ? ", loaded" : ""}`}
      data-nav-default={isDefault ? "" : undefined}
      className="ring-tile group flex w-full flex-col gap-2 rounded-tile bg-transparent p-0 text-left"
    >
      <span className="relative flex aspect-square w-full overflow-hidden rounded-tile shadow-soft transition-[box-shadow,translate] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-lift group-focus:shadow-lift">
        <BoxArt game={game} />
        {current && (
          <span className="absolute top-2 left-2 rounded-full bg-primary-text px-2.5 py-1 text-[11px] font-extrabold text-white">
            Loaded
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-sm font-bold text-text">{game.title}</span>
        <span className="truncate text-xs font-bold text-text-muted">{game.system}</span>
      </span>
    </button>
  );
}

const ART_COLORS = ["#E5603F", "#1F9E89", "#7A5AF0", "#E0A21B", "#1A5FC0"];

/** Box art when libretro has it; generated initials while it loads or if it doesn't. */
function BoxArt({ game, small }: { game: Game; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  let hash = 0;
  for (const ch of game.title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = ART_COLORS[hash % ART_COLORS.length];
  const initials = game.title
    .split(/\s+/)
    // Capitalized words only, so "The Legend of Zelda" reads TLZ.
    .filter((w) => /^[A-Z0-9]/.test(w))
    .slice(0, 3)
    // Keep numbers whole so "Mario Kart 64" reads MK64.
    .map((w) => (/^\d/.test(w) ? w : w[0]))
    .join("");
  return (
    <span
      aria-hidden
      className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden font-extrabold text-white/90 ${
        small ? "text-3xl" : "text-4xl"
      }`}
      style={{ background: `linear-gradient(135deg, ${color}, #2B2B2E)` }}
    >
      {initials}
      {game.cover && !failed && (
        // Plain <img>: cross-origin, already sized, and next/image would need a remote loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

function EmptyLibrary({
  folderName,
  onFolder,
  isDefault,
}: {
  folderName: string | null;
  onFolder: () => void;
  isDefault: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border-2 border-dashed border-line px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="text-lg font-extrabold">{folderName ? `No games in ${folderName}` : "Your games live here"}</span>
        <span className="max-w-[46ch] text-sm font-semibold text-text-muted">
          Open the folder where you keep your ROMs. Gameroom reads it in your browser and never uploads it. SNES, NES,
          Genesis, Game Boy and GBA files work.
        </span>
      </div>
      <button
        type="button"
        onClick={onFolder}
        data-nav-default={isDefault ? "" : undefined}
        className="ring-row inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-text px-5 text-sm font-extrabold text-white"
      >
        <FolderOpen size={18} aria-hidden />
        {folderName ? "Choose another folder" : "Open ROM folder"}
      </button>
    </div>
  );
}

function ToolButton({ icon: Icon, children, onClick }: { icon: LucideIcon; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ring-row inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-extrabold shadow-soft"
    >
      <Icon size={16} aria-hidden />
      {children}
    </button>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`ring-row min-h-9 rounded-full px-4 text-[13px] font-extrabold ${
        selected ? "bg-text text-white" : "bg-transparent text-text-muted shadow-[inset_0_0_0_2px_var(--line)]"
      }`}
    >
      {children}
    </button>
  );
}

function OptionRow({
  icon: Icon,
  color,
  children,
  detail,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  children: React.ReactNode;
  detail: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      className={`ring-row flex min-h-14 items-center gap-3 rounded-xl px-3 text-left ${selected ? "bg-bg" : "bg-transparent"}`}
    >
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full bg-bg ${color}`}>
        <Icon size={19} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-extrabold">{children}</span>
        <span className="truncate text-xs font-bold text-text-muted">{detail}</span>
      </span>
      <ChevronRight size={18} className="flex-none text-slot-empty" aria-hidden />
    </button>
  );
}
