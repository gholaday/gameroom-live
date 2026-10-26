// This device's game volume and mute, remembered in localStorage. Only your
// own speakers: the host turning it down doesn't change what guests hear.

const KEY = "gameroom-audio";

export type AudioPref = { volume: number; muted: boolean };

const DEFAULT: AudioPref = { volume: 1, muted: false };
const listeners = new Set<() => void>();
let pref: AudioPref | null = null;

export const subscribeAudio = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function getAudio(): AudioPref {
  if (!pref) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AudioPref> | null;
      const volume = Number(saved?.volume);
      pref = { volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1, muted: !!saved?.muted };
    } catch {
      pref = DEFAULT;
    }
  }
  return pref;
}

export const getAudioServer = () => DEFAULT;

export function setAudio(patch: Partial<AudioPref>) {
  pref = { ...getAudio(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {}
  for (const fn of listeners) fn();
}

/** What actually reaches the speakers. */
export const effectiveVolume = (p: AudioPref) => (p.muted ? 0 : p.volume);
