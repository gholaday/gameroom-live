import { systemForFile } from "@/lib/emulator/systems";

/**
 * One ROM in the host's library. `dir` entries are read through the saved
 * folder handle on demand; `copy` entries were copied into IndexedDB (browsers
 * without the File System Access API, or single files opened by hand).
 */
export type LibraryEntry = { path: string; title: string; kind: "dir" | "copy" };

/** "Legend of Zelda, The - A Link to the Past (USA).sfc" reads as "The Legend of Zelda - A Link to the Past". */
export function gameTitle(fileName: string) {
  const bare = fileName.replace(/\.[^.]+$/, "").replace(/\s*[([][^)\]]*[)\]]/g, "").trim() || fileName;
  // No-Intro style moves a leading article to the end of the first part.
  return bare.replace(/^([^,]+), (The|A|An)\b/, "$2 $1");
}

const fileName = (path: string) => path.split("/").pop()!;

const DISC_INDEX = /\.(cue|ccd|toc|m3u|chd|iso)$/i;
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

/**
 * Drops .bin files that sit beside a disc index (a .cue and the like): those
 * are CD tracks, a PS1 game say, not Genesis carts that happen to share the
 * extension.
 */
export function withoutDiscTracks<T extends { path: string }>(files: T[]): T[] {
  const discDirs = new Set(files.filter((f) => DISC_INDEX.test(f.path)).map((f) => dirOf(f.path)));
  if (!discDirs.size) return files;
  return files.filter((f) => !(/\.bin$/i.test(f.path) && discDirs.has(dirOf(f.path))));
}

/** Keeps ROMs only, one per file name

/**
 * Keeps ROMs only, one per file name (the same ROM opened by hand and found in
 * a folder, or a folder added twice), later entries winning. Sorted by title.
 */
export function mergeEntries(existing: LibraryEntry[], added: { path: string; kind: LibraryEntry["kind"] }[]) {
  const byName = new Map(existing.map((e) => [fileName(e.path), e]));
  for (const { path, kind } of added) {
    const name = fileName(path);
    if (systemForFile(name)) byName.set(name, { path, kind, title: gameTitle(name) });
  }
  return [...byName.values()].sort((a, b) => a.title.localeCompare(b.title));
}
