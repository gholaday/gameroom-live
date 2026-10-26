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
