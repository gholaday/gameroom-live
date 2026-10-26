import type { SystemId } from "@/lib/emulator/systems";

// Box art from libretro-thumbnails, keyed by the ROM's No-Intro file name
// ("Legend of Zelda, The - A Link to the Past (USA)"). GitHub serves it with
// CORS and a cross-origin CORP header, so it loads fine under our COEP.

const REPOS: Record<SystemId, string> = {
  snes: "Nintendo_-_Super_Nintendo_Entertainment_System",
  nes: "Nintendo_-_Nintendo_Entertainment_System",
  genesis: "Sega_-_Mega_Drive_-_Genesis",
  gb: "Nintendo_-_Game_Boy",
  gba: "Nintendo_-_Game_Boy_Advance",
};
const GBC = "Nintendo_-_Game_Boy_Color";

export function coverUrl(fileName: string, system: SystemId) {
  const dot = fileName.lastIndexOf(".");
  const ext = fileName.slice(dot + 1).toLowerCase();
  // libretro's thumbnail names replace these characters with underscores.
  const base = fileName.slice(0, dot).replace(/[&*/:`<>?\\|"]/g, "_");
  const repo = system === "gb" && ext === "gbc" ? GBC : REPOS[system];
  return `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts/${encodeURIComponent(base)}.png`;
}
