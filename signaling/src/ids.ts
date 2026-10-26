// Peer ids carry their room: the host is `gameroom-live-ABCD`, guests are
// `gameroom-live-ABCD-<random>`. One Durable Object per room relays between them.
const PEER_ID = /^gameroom-live-([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4})(?:-[a-z0-9]{8,32})?$/;

/** The room code for a peer id, or null if the id isn't one of ours. */
export function roomForPeerId(id: string): string | null {
  return PEER_ID.exec(id)?.[1] ?? null;
}

/** Origins allowed to open signaling sockets: exact matches, comma separated. */
export function originAllowed(origin: string | null, allowed: string) {
  if (!origin) return false;
  return allowed.split(",").some((o) => o.trim() === origin);
}
