// No accounts: a display name lives in localStorage on each device.
const KEY = "gameroom-name";
export const MAX_NAME = 24;

export function getName(fallback: string) {
  try {
    return localStorage.getItem(KEY)?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function setName(name: string) {
  try {
    localStorage.setItem(KEY, name.trim().slice(0, MAX_NAME));
  } catch {}
}

/** Random id that survives a reload of this tab, for reclaiming a slot. */
export function tabToken(scope: string) {
  const key = `gameroom-token-${scope}`;
  try {
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(key, token);
    }
    return token;
  } catch {
    return crypto.randomUUID();
  }
}
