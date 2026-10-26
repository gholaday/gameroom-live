import { systemForFile, type System } from "@/lib/emulator/systems";
import { coverUrl } from "@/lib/library/covers";
import { gameTitle } from "@/lib/library/entries";
import type { Game } from "@/lib/net/protocol";

/** What the UI and guests know about a ROM, from its file name alone. Null if no system runs it. */
export function gameForFile(fileName: string): { game: Game; system: System } | null {
  const system = systemForFile(fileName);
  if (!system) return null;
  return {
    system,
    game: {
      title: gameTitle(fileName),
      system: system.name,
      systemId: system.id,
      maxPlayers: system.players,
      cover: coverUrl(fileName, system.id),
    },
  };
}
