// The room code this tab hosts, in sessionStorage: it survives a reload of the
// tab but not other tabs, so a second tab opening the same link is a guest.
// Kept apart from the host session so the join page can check it cheaply.

const ROOM_KEY = "gameroom-room";

export function readRoom() {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

export function writeRoom(code: string) {
  try {
    sessionStorage.setItem(ROOM_KEY, code);
  } catch {}
}

export function clearRoom() {
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch {}
}
