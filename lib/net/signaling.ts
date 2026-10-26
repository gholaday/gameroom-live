import type { PeerOptions } from "peerjs";
import { peerIdFor } from "@/lib/net/room";

// Where PeerJS does its signaling: our Cloudflare Worker (signaling/) when
// NEXT_PUBLIC_SIGNALING_URL is set, otherwise PeerJS's public broker.

/** PeerJS server options for the configured signaling URL. */
export function signalingOptions(): Partial<PeerOptions> {
  const raw = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (!raw) return {};
  const url = new URL(raw);
  const secure = url.protocol === "wss:" || url.protocol === "https:";
  return {
    host: url.hostname,
    port: Number(url.port) || (secure ? 443 : 80),
    path: url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`,
    secure,
    key: "gameroom",
  };
}

/** Guest ids carry the room code so the Worker can route them to the room. */
export function guestPeerId(code: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${peerIdFor(code)}-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
