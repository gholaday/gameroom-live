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
  Power,
  Plus,
  RefreshCw,
  Save,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Cartridge, cartSize } from "@/components/cartridge";
import { ControlsPanel } from "@/components/controls-panel";
import { ago, Thumb } from "@/components/save-slots";
import { PlayersPanel, SettingsPanel } from "@/components/players-panel";
import { Avatar, Dot, EmptySlot, Footer, Hint, Pill, type PlayerSlot } from "@/components/ui";
import { HOST_RESERVED } from "@/lib/emulator/host-input";
import { ROM_ACCEPT, SYSTEMS, type SystemId } from "@/lib/emulator/systems";
import type { SaveSlot } from "@/lib/host/saves-store";
import { hostSession } from "@/lib/host/session";
import { gameForFile } from "@/lib/library/games";
import type { LibraryEntry } from "@/lib/library/entries";
import { canPickFolder, library } from "@/lib/library/store";
import type { Game } from "@/lib/net/protocol";
import { useInitialFocus, useNavAction } from "@/lib/nav/react";
import { useHost, useOrigin } from "@/lib/use-origin";

const SLOTS: PlayerSlot[] = [1, 2, 3, 4];

type View = "library" | "players" | "saves" | "settings";

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
  // One shelf per system you have games for, in the systems table's order.
  const shelves = useMemo(
    () =>
      Object.values(SYSTEMS)
        .map((sys) => ({ sys, games: games.filter((g) => g.game.systemId === sys.id) }))
        .filter((shelf) => shelf.games.length),
    [games],
  );
  const shown = shelves.some((sh) => sh.sys.id === filter) ? shelves.filter((sh) => sh.sys.id === filter) : shelves;
  const firstPath = shown[0]?.games[0]?.entry.path;

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
  const toggleView = (v: View) => setView((cur) => (cur === v ? "library" : v));

  useNavAction("start", start);
  useNavAction("x", focusInvite);
  // B backs out of an option view first; on the library it ends the session.
  useNavAction("back", () => (view === "library" ? endSession() : setView("library")));

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

  // Picking a tile selects the game, so its saves can be looked at first.
  // Picking the selected one again starts it.
  const selectEntry = async (entry: LibraryEntry, name: string) => {
    if (snap.rom?.file.name === name) return start();
    if (snap.running) return setNote("A game is running. End the session to pick another.");
    try {
      setNote(hostSession.setRom(await library.file(entry)));
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
        <div className="flex min-w-0 flex-col lg:min-h-0 scrollbar lg:overflow-y-auto lg:pr-2 [scrollbar-gutter:stable]">
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

              {shelves.length > 1 && (
                <div role="tablist" aria-label="System" className="flex flex-wrap gap-2">
                  <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
                    All
                  </Chip>
                  {shelves.map(({ sys }) => (
                    <Chip key={sys.id} selected={filter === sys.id} onClick={() => setFilter(sys.id)}>
                      {sys.name}
                    </Chip>
                  ))}
                </div>
              )}

              {games.length ? (
                <div className="flex flex-col gap-9">
                  {shown.map(({ sys, games: list }) => (
                    <section key={sys.id} aria-label={`${sys.name} games`} className="flex flex-col gap-2">
                      <h2 className="text-[13px] font-extrabold tracking-wide text-text-muted uppercase">
                        {sys.name} <span className="font-bold">{list.length}</span>
                      </h2>
                      {/* Side padding leaves room for the focus ring and the shelf ends. */}
                      <ul className="flex flex-wrap items-end gap-x-6 gap-y-7 px-3 pt-4">
                        {list.map(({ entry, name, game: g }) => (
                          <li key={entry.path} className="flex">
                            <ShelfCart
                              game={g}
                              selected={snap.rom?.file.name === name}
                              isDefault={!game && entry.path === firstPath}
                              onClick={() => void selectEntry(entry, name)}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
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
                  {view === "players" ? "Players" : view === "saves" ? "Saves" : "Settings"}
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
              ) : view === "saves" ? (
                <SavesView game={game} romName={snap.rom?.file.name ?? null} onPlay={start} />
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
        <aside className="flex flex-col gap-4 pb-8 scrollbar lg:min-h-0 lg:overflow-y-auto">
          <ConsoleDeck
            game={game}
            insertKey={snap.rom?.file.name ?? ""}
            label={snap.running ? "Playing now" : snap.resuming ? "Continues where you left off" : "Ready"}
            onStart={start}
            onEnd={endSession}
            canEnd={!!game || snap.players.length > 1 || snap.spectators > 0}
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
              onClick={() => toggleView("players")}
            >
              Players
            </OptionRow>
            <OptionRow
              icon={Save}
              color="text-p3"
              selected={view === "saves"}
              onClick={() => toggleView("saves")}
            >
              Saves
            </OptionRow>
            <OptionRow
              icon={Settings}
              color="text-text-muted"
              selected={view === "settings"}
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

/** The console in the side column. The selected cartridge sits in its slot; Start lights up. */
function ConsoleDeck({
  game,
  insertKey,
  label,
  onStart,
  onEnd,
  canEnd,
}: {
  game: Game | null;
  insertKey: string;
  label: string;
  onStart: () => void;
  onEnd: () => void;
  canEnd: boolean;
}) {
  const size = game ? cartSize(game.systemId) : null;
  return (
    <section aria-label="Console" className="mb-2 flex flex-col pt-1">
      {/* The cart's lower part sits behind the console body, as if pushed into the slot. */}
      <div className="relative h-[120px]">
        {game && size && (
          <div key={insertKey} className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -size.height * 0.28 }}>
            <Cartridge game={game} className="cart-insert cart-shadow" />
          </div>
        )}
      </div>
      <div className="console-body relative z-10 flex flex-col gap-4 rounded-[26px] px-5 pt-7 pb-5">
        <span
          aria-hidden
          className="absolute top-0 left-1/2 h-3 -translate-x-1/2 rounded-b-lg bg-[#2B2B2E] transition-[width] duration-300 ease-out"
          style={{ width: (size?.width ?? 140) + 14 }}
        />
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 flex-none rounded-full transition-[background-color,box-shadow] duration-300 ${
              game ? "bg-live shadow-[0_0_10px_2px_rgba(229,72,59,0.55)]" : "bg-slot-empty"
            }`}
          />
          <div className="flex min-w-0 flex-col">
            {game ? (
              <>
                <span className="text-[11px] font-extrabold tracking-wide text-primary-text uppercase">{label}</span>
                <span className="line-clamp-2 text-lg leading-tight font-extrabold">{game.title}</span>
                <span className="text-[13px] font-bold text-text-muted">{game.system}</span>
              </>
            ) : (
              <>
                <span className="text-lg leading-tight font-extrabold">No game inserted</span>
                <span className="text-[13px] font-bold text-text-muted">Pick a cartridge from the shelf.</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onEnd}
            disabled={!canEnd}
            className="ring-row inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/5 px-4 text-[13px] font-extrabold text-text transition-colors hover:bg-danger hover:text-white disabled:cursor-default disabled:bg-transparent disabled:text-slot-empty"
          >
            <Power size={15} aria-hidden />
            End session
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={!game}
            data-nav-default={game ? "" : undefined}
            className="ring-row inline-flex min-h-12 items-center gap-2 rounded-full bg-primary-text px-7 text-base font-extrabold text-white shadow-[0_4px_0_#123F80] transition-[background-color,box-shadow,translate] duration-200 active:translate-y-0.5 active:shadow-[0_2px_0_#123F80] disabled:cursor-default disabled:bg-[#CFCFD5] disabled:text-[#86868E] disabled:shadow-[0_4px_0_#B5B5BC]"
          >
            <Play size={16} fill="currentColor" aria-hidden />
            Start
          </button>
        </div>
      </div>
    </section>
  );
}

function ShelfCart({
  game,
  selected,
  isDefault,
  onClick,
}: {
  game: Game;
  selected: boolean;
  isDefault: boolean;
  onClick: () => void;
}) {
  // Small carts still get room for a two-line title.
  const width = Math.max(cartSize(game.systemId).width, 116);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${game.title}, ${game.system}${selected ? ", in the console. Start" : ""}`}
      data-nav-default={isDefault ? "" : undefined}
      className="ring-tile group flex flex-col items-center rounded-tile bg-transparent p-0"
      style={{ width }}
    >
      <Cartridge
        game={game}
        ghost={selected}
        className={
          selected
            ? ""
            : "cart-shadow transition-[translate] duration-200 ease-out group-hover:-translate-y-1.5 group-focus:-translate-y-1.5"
        }
      />
      <span aria-hidden className="shelf-board -mx-3 h-2.5 self-stretch" />
      <span
        className={`mt-2 line-clamp-2 h-[2.5em] text-center text-[13px] leading-[1.25] font-bold ${
          selected ? "text-text-muted" : "text-text"
        }`}
      >
        {game.title}
      </span>
    </button>
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
  selected,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      className={`ring-row flex min-h-12 items-center gap-3 rounded-xl px-3 text-left ${selected ? "bg-bg" : "bg-transparent"}`}
    >
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full bg-bg ${color}`}>
        <Icon size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-extrabold">{children}</span>
      <ChevronRight size={18} className="flex-none text-slot-empty" aria-hidden />
    </button>
  );
}

/** The loaded game's save slots. Picking one starts the game from it. */
function SavesView({ game, romName, onPlay }: { game: Game | null; romName: string | null; onPlay: () => void }) {
  const [slots, setSlots] = useState<{ rom: string; list: (SaveSlot | null)[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!romName) return;
    let live = true;
    void hostSession.listSlots().then((list) => live && setSlots({ rom: romName, list }));
    return () => {
      live = false;
    };
  }, [romName]);

  if (!game) return <p className="text-sm font-semibold text-text-muted">Pick a game from your library to see its saves.</p>;
  const list = slots?.rom === romName ? slots.list : null;

  const play = async (slot: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await hostSession.playSlot(slot);
      onPlay();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-text-muted">
        Saves for {game.title}. Save during play from the menu (Esc, Home, or Select+Start), then pick a slot here to play
        from it.
      </p>
      <ul className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 p-2">
        {(list ?? [null, null, null, null]).map((save, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={!save || busy}
              onClick={() => void play(i + 1)}
              aria-label={`Slot ${i + 1}, ${save ? ago(save.savedAt) : "empty"}`}
              className="ring-tile flex w-full flex-col gap-2 rounded-tile bg-transparent p-0 text-left disabled:cursor-default"
            >
              <span className="relative flex aspect-[4/3] w-full">
                <Thumb save={save} className="h-full w-full rounded-tile shadow-soft" />
                {!save && (
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-white/50">
                    Empty
                  </span>
                )}
              </span>
              <span className="flex flex-col px-0.5">
                <span className="text-sm font-extrabold">Slot {i + 1}</span>
                <span className="text-xs font-bold text-text-muted">{save ? ago(save.savedAt) : "Nothing saved yet"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
