import { idb } from "@/lib/host/resume-store";

// Save state slots per game, in IndexedDB. Keyed by ROM file name, so the same
// game opened from the library or by hand shares its slots.

export const SAVE_SLOTS = [1, 2, 3, 4] as const;

export type SaveSlot = {
  slot: number;
  state: Blob;
  /** Small JPEG of the frame at save time. */
  thumbnail: Blob | null;
  savedAt: number;
};

const STORE = "saves";
const key = (romName: string, slot: number) => `${romName}#${slot}`;

/** Every slot for this game, empty ones as null. */
export async function listSaves(romName: string): Promise<(SaveSlot | null)[]> {
  try {
    return await Promise.all(
      SAVE_SLOTS.map(async (slot) => ((await idb(STORE, "readonly", (s) => s.get(key(romName, slot)))) as SaveSlot) ?? null),
    );
  } catch {
    return SAVE_SLOTS.map(() => null);
  }
}

export async function writeSave(romName: string, save: SaveSlot) {
  await idb(STORE, "readwrite", (s) => s.put(save, key(romName, save.slot)));
}
