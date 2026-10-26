import { idb } from "@/lib/host/resume-store";
import {
  cueTracks,
  dirOf,
  fileName,
  mergeEntries,
  withoutDiscTracks,
  type LibraryEntry,
} from "@/lib/library/entries";

// The host's ROM library, kept across browser restarts. Chromium saves the
// folder handle itself in IndexedDB and reads ROMs from disk on demand; other
// browsers copy the ROM bytes in (SNES ROMs are at most a few MB each).

const STORE = "library";
const DIR_KEY = "dir";
const ENTRIES_KEY = "entries";
/** File names removed from the library, so a folder rescan doesn't bring them back. */
const HIDDEN_KEY = "hidden";
const fileKey = (path: string) => `file:${path}`;

export type LibrarySnapshot = {
  loaded: boolean;
  entries: LibraryEntry[];
  folderName: string | null;
  /** The folder is remembered but the browser wants a click before reading it again. */
  needsPermission: boolean;
};

// Chromium's File System Access API, not yet in TypeScript's DOM lib.
type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission(opts: { mode: "read" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "read" }): Promise<PermissionState>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (opts: {
    id: string;
    mode: "read";
  }) => Promise<DirHandle>;
};

/** True where folders can be remembered without copying (Chrome, Edge). */
export const canPickFolder = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

class Library {
  private snapshot: LibrarySnapshot = {
    loaded: false,
    entries: [],
    folderName: null,
    needsPermission: false,
  };
  private readonly listeners = new Set<() => void>();
  private dir: DirHandle | null = null;
  private hidden = new Set<string>();
  private loading: Promise<void> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<LibrarySnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Shows the saved list right away, then rescans the folder if we still may. */
  load() {
    this.loading ??= (async () => {
      const [dir, entries, hidden] = await Promise.all([
        get<DirHandle>(DIR_KEY),
        get<LibraryEntry[]>(ENTRIES_KEY),
        get<string[]>(HIDDEN_KEY),
      ]);
      this.dir = dir ?? null;
      this.hidden = new Set(hidden);
      const granted = dir
        ? (await dir.queryPermission({ mode: "read" })) === "granted"
        : false;
      // Merging again drops duplicates saved before entries were keyed by file name.
      this.set({
        loaded: true,
        entries: mergeEntries([], entries ?? []),
        folderName: dir?.name ?? null,
        needsPermission: !!dir && !granted,
      });
      if (granted) await this.rescan();
    })().catch(() => this.set({ loaded: true }));
    return this.loading;
  }

  /** Chromium only: pick a folder, remember it, and list every ROM inside. */
  async pickFolder() {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) return;
    let dir: DirHandle;
    try {
      dir = await picker({ id: "gameroom-roms", mode: "read" });
    } catch {
      return; // Cancelled.
    }
    this.dir = dir;
    await put(DIR_KEY, dir);
    // Picking a folder on purpose shows everything in it again.
    this.hidden.clear();
    await put(HIDDEN_KEY, []);
    // Copies from a previous folder stay; old folder entries go.
    const copies = this.snapshot.entries.filter((e) => e.kind === "copy");
    this.set({ entries: copies, folderName: dir.name, needsPermission: false });
    await this.rescan();
  }

  /** Copies ROMs in: a folder from `<input webkitdirectory>`, or single files. */
  async importFiles(files: Iterable<File>) {
    const added: { path: string; kind: "copy" }[] = [];
    const all = [...files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    const named = withoutDiscTracks(all);
    // A disc's tracks aren't games of their own, but its .cue needs them stored too.
    for (const track of all) if (!named.includes(track)) await put(fileKey(track.path), track.file);
    for (const { file, path } of named) {
      if (!mergeEntries([], [{ path, kind: "copy" }]).length) continue;
      await put(fileKey(path), file);
      added.push({ path, kind: "copy" });
      this.hidden.delete(fileName(path));
    }
    if (added.length) await put(HIDDEN_KEY, [...this.hidden]);
    const entries = mergeEntries(this.snapshot.entries, added);
    this.set({ entries });
    await put(ENTRIES_KEY, entries);
    return added.length;
  }

  /**
   * The entry's file, plus the track files a .cue names (read from beside it).
   * Must run from a click: may ask the browser for folder access again.
   */
  async files(entry: LibraryEntry): Promise<{ file: File; extra: File[] }> {
    const file = await this.file(entry);
    if (!/\.cue$/i.test(file.name)) return { file, extra: [] };
    const extra = await Promise.all(
      cueTracks(await file.text()).map((name) =>
        this.file({ ...entry, path: dirOf(entry.path) + name }).catch(() => {
          throw new Error(`${name} is missing. Keep a game's .bin files next to its .cue.`);
        }),
      ),
    );
    return { file, extra };
  }

  /** Must run from a click: may ask the browser for folder access again. */
  async file(entry: LibraryEntry): Promise<File> {
    const name = entry.path.split("/").pop()!;
    if (entry.kind === "copy") {
      const blob = await get<Blob>(fileKey(entry.path));
      if (!blob) throw new Error("That ROM is no longer saved. Open it again.");
      return new File([blob], name);
    }
    const dir = await this.access();
    let handle: FileSystemDirectoryHandle = dir;
    const parts = entry.path.split("/");
    for (const part of parts.slice(1, -1))
      handle = await handle.getDirectoryHandle(part);
    const file = await (await handle.getFileHandle(name)).getFile();
    return file;
  }

  /** Asks again for the remembered folder (needs a click), then rescans. */
  async reconnect() {
    await this.access();
    await this.rescan();
  }

  /** Takes a game off the shelf. Copied bytes are deleted; a file in the folder stays on disk. */
  async remove(entry: LibraryEntry) {
    const name = fileName(entry.path);
    const entries = this.snapshot.entries.filter(
      (e) => fileName(e.path) !== name,
    );
    this.set({ entries });
    if (entry.kind === "copy") {
      // A copied disc's tracks go with it.
      const tracks = /\.cue$/i.test(name)
        ? await this.file(entry).then((f) => f.text()).then(cueTracks, () => [])
        : [];
      for (const track of tracks) await del(fileKey(dirOf(entry.path) + track));
      await del(fileKey(entry.path));
    }
    else {
      this.hidden.add(name);
      await put(HIDDEN_KEY, [...this.hidden]);
    }
    await put(ENTRIES_KEY, entries);
  }

  async forget() {
    this.dir = null;
    await idb(STORE, "readwrite", (s) => s.clear()).catch(() => {});
    this.set({ entries: [], folderName: null, needsPermission: false });
  }

  private async access() {
    const dir = this.dir;
    if (!dir)
      throw new Error("The ROM folder is no longer available. Open it again.");
    if ((await dir.queryPermission({ mode: "read" })) !== "granted") {
      if ((await dir.requestPermission({ mode: "read" })) !== "granted") {
        throw new Error(
          "The browser needs permission to read your ROM folder.",
        );
      }
      this.set({ needsPermission: false });
    }
    return dir;
  }

  private async rescan() {
    const dir = this.dir;
    if (!dir) return;
    const found: { path: string; kind: "dir" }[] = [];
    await walk(dir, dir.name, found);
    const shown = found.filter((f) => !this.hidden.has(fileName(f.path)));
    const copies = this.snapshot.entries.filter((e) => e.kind === "copy");
    const entries = mergeEntries(copies, withoutDiscTracks(shown));
    this.set({ entries });
    await put(ENTRIES_KEY, entries);
  }
}

/** Paths start with the folder's own name, so they read the same as webkitRelativePath. */
async function walk(
  dir: DirHandle,
  prefix: string,
  out: { path: string; kind: "dir" }[],
  depth = 0,
) {
  if (depth > 6) return;
  for await (const handle of dir.values()) {
    const path = `${prefix}/${handle.name}`;
    if (handle.kind === "directory")
      await walk(handle as DirHandle, path, out, depth + 1);
    else out.push({ path, kind: "dir" });
  }
}

async function get<T>(key: string) {
  return (await idb(STORE, "readonly", (s) => s.get(key))) as T | undefined;
}
async function put(key: string, value: unknown) {
  await idb(STORE, "readwrite", (s) => s.put(value, key));
}
async function del(key: string) {
  await idb(STORE, "readwrite", (s) => s.delete(key));
}

export const library = new Library();

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __gameroomLibrary: Library }).__gameroomLibrary =
    library;
}
