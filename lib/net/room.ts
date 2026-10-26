// Room codes are 4 characters from an alphabet without look-alikes (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Namespaced for the public broker; our Worker also routes by the code in it. */
export const peerIdFor = (code: string) => `gameroom-live-${code.toUpperCase()}`;

/** Spectators are unlimited by design, but each guest costs the host one encode. */
export const MAX_GUESTS = 7;
export const MAX_PLAYERS = 4;
