"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Dot, Hint, HintBar, latencyClass, latencyDotClass } from "@/components/ui";
import { GAMES, MENU_PLAYERS, ROOM_CODE, type Game } from "@/lib/fake-data";
import { useGameMode, useInitialFocus, useNavAction } from "@/lib/nav/react";
import { useHost } from "@/lib/use-origin";

const FAKE_RTT = 46;
const FAKE_FPS = 60;

export function PlayScreen({ gameId }: { gameId?: string }) {
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
  const [menuOpen, setMenuOpen] = useState(false);

  useGameMode(!menuOpen);
  useNavAction("start", () => setMenuOpen((open) => !open));

  return (
    <div className="fixed inset-0 overflow-hidden bg-game-bg">
      <div
        inert={menuOpen}
        className="absolute inset-0 flex items-center justify-center p-6"
      >
        {/* Placeholder for the host canvas or the guest <video>. */}
        <div
          className={`flex aspect-[4/3] max-h-full w-auto max-w-full items-center justify-center rounded-lg bg-[#1E1E22] text-sm text-[#77777F] transition-opacity duration-150 ${
            menuOpen ? "opacity-55" : ""
          }`}
          style={{ height: "min(100%, 75vw)" }}
        >
          Game stream
        </div>
        <span className="absolute top-6 left-6 inline-flex items-center gap-2 rounded-full bg-white/92 px-3.5 py-[7px] text-[13px] font-extrabold">
          <Dot className={latencyDotClass(FAKE_RTT)} size={8} />
          {FAKE_RTT} ms
          <span className="font-bold text-text-muted">{FAKE_FPS} fps</span>
        </span>
        {!menuOpen && (
          <span className="absolute bottom-5 left-6 text-[13px] font-bold text-white/45">
            Press Start or Esc for the menu
          </span>
        )}
      </div>

      {menuOpen && <GameMenu game={game} onResume={() => setMenuOpen(false)} />}
    </div>
  );
}

function GameMenu({ game, onResume }: { game: Game; onResume: () => void }) {
  const router = useRouter();
  const host = useHost();
  const [note, setNote] = useState<string | null>(null);

  useInitialFocus();
  useNavAction("back", onResume);

  const resume = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onResume();
  };

  return (
    <>
      <div aria-hidden className="absolute inset-0 bg-black/45" onClick={resume} />
      <aside
        aria-label="Game menu"
        className="menu-in absolute top-0 right-0 bottom-0 flex w-full max-w-[420px] flex-col overflow-y-auto rounded-l-menu bg-panel"
      >
        <div className="flex flex-col gap-1 px-7 pt-7 pb-[18px]">
          <span className="text-[13px] font-bold text-text-muted">{game.system}</span>
          <h1 className="text-2xl font-extrabold">{game.title}</h1>
        </div>

        <ul className="flex flex-col gap-1 px-5" aria-label="Players">
          {MENU_PLAYERS.map((p) => (
            <li key={p.slot} className="flex items-center gap-3 p-2">
              <Avatar slot={p.slot} name={p.name} size={36} />
              <span className="flex-1 font-bold">{p.name}</span>
              {p.isHost ? (
                <span className="text-[13px] font-bold text-text-muted">Host</span>
              ) : (
                <span className={`text-[13px] font-bold ${latencyClass(p.rttMs ?? 0)}`}>
                  {p.rttMs} ms
                </span>
              )}
            </li>
          ))}
        </ul>

        <nav className="mx-5 mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3.5">
          <MenuRow onClick={resume} isDefault>
            Resume
          </MenuRow>
          <MenuRow onClick={() => setNote("Save states arrive in a later milestone.")}>
            Save state
          </MenuRow>
          <MenuRow onClick={() => setNote("Save states arrive in a later milestone.")}>
            Load state
          </MenuRow>
          <MenuRow onClick={() => setNote(`Share ${host}/r/${ROOM_CODE}`)}>Invite friends</MenuRow>
          <MenuRow onClick={() => router.push("/")} danger>
            End session
          </MenuRow>
          {note && (
            <p role="status" className="px-4 pt-2 text-[13px] font-bold text-text-muted">
              {note}
            </p>
          )}
        </nav>

        <div className="mt-auto flex justify-end px-7 pt-[18px] pb-[22px]">
          <HintBar>
            <Hint button="B">Back</Hint>
            <Hint button="A">OK</Hint>
          </HintBar>
        </div>
      </aside>
    </>
  );
}

function MenuRow({
  children,
  onClick,
  isDefault,
  danger,
}: {
  children: string;
  onClick: () => void;
  isDefault?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-nav-default={isDefault ? "" : undefined}
      className={`ring-row min-h-[52px] rounded-xl px-4 text-left text-base font-bold focus:bg-surface focus:font-extrabold ${
        danger ? "font-extrabold text-danger" : "text-text focus:text-primary-text"
      }`}
    >
      {children}
    </button>
  );
}
