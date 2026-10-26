// No accounts: a display name lives in localStorage on each device.
const KEY = "gameroom-name";

export function getName(fallback: string) {
  try {
    return localStorage.getItem(KEY)?.trim() || fallback;
  } catch {
    return fallback;
  }
}
