// Host-side IndexedDB records so a refresh or crash resumes near where play
// stopped. The ROM and the latest save state are separate keys, so the 10 s
// autosave only rewrites the small state, never the multi-MB ROM.

export type ResumeRecord = {
  romName: string;
  rom: Blob;
  state: Blob | null;
};

type RomEntry = { romName: string; rom: Blob };

const DB = "gameroom";
const STORE = "resume";
const ROM_KEY = "rom";
const STATE_KEY = "state";

let dbPromise: Promise<IDBDatabase> | null = null;

/** Shared by the ROM library (version 2) and save slots (version 3). */
export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE, "library", "saves"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer tab upgrade the schema instead of blocking it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function idb<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadResume(): Promise<ResumeRecord | null> {
  try {
    const rom = (await idb(STORE, "readonly", (s) => s.get(ROM_KEY))) as RomEntry | undefined;
    if (!rom) return null;
    const state = ((await idb(STORE, "readonly", (s) => s.get(STATE_KEY))) as Blob | undefined) ?? null;
    return { ...rom, state };
  } catch {
    return null;
  }
}

/** A new game: store its ROM and forget the old state. */
export async function saveResumeRom(romName: string, rom: Blob) {
  try {
    await idb(STORE, "readwrite", (s) => s.delete(STATE_KEY));
    await idb(STORE, "readwrite", (s) => s.put({ romName, rom } satisfies RomEntry, ROM_KEY));
  } catch {}
}

export async function saveResumeState(state: Blob) {
  try {
    await idb(STORE, "readwrite", (s) => s.put(state, STATE_KEY));
  } catch {}
}

export async function clearResume() {
  try {
    await idb(STORE, "readwrite", (s) => s.clear());
  } catch {}
}
