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

/** Keeps ROMs only, later entries win on the same path, sorted by title. */
export function mergeEntries(existing: LibraryEntry[], added: { path: string; kind: LibraryEntry["kind"] }[]) {
  const byPath = new Map(existing.map((e) => [e.path, e]));
  for (const { path, kind } of added) {
    const name = path.split("/").pop()!;
    if (systemForFile(name)) byPath.set(path, { path, kind, title: gameTitle(name) });
  }
  return [...byPath.values()].sort((a, b) => a.title.localeCompare(b.title));
}
