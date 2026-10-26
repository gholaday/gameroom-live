import { DurableObject } from "cloudflare:workers";
import { originAllowed, roomForPeerId } from "./ids";

// A PeerJS-compatible signaling server: the PeerJS client in the app connects
// here instead of the public 0.peerjs.com broker. Only offers, answers and ICE
// candidates pass through; media and input flow peer to peer.
//
// Protocol (PeerJS server): the client opens
//   /peerjs?key=<key>&id=<id>&token=<token>&version=<v>
// and gets {type:"OPEN"}. It sends {type, dst, payload}; we forward it to the
// socket with id `dst`, adding `src`. An offer to an id that isn't here gets
// {type:"EXPIRE"}, which the client reports as "peer-unavailable".

export interface Env {
  ROOMS: DurableObjectNamespace<SignalRoom>;
  /** Comma-separated exact origins allowed to connect. */
  ALLOWED_ORIGINS: string;
}

/** Host plus MAX_GUESTS (7), with headroom for reloads overlapping. */
const MAX_PEERS = 16;
/** SDP offers are a few KB; anything far larger isn't signaling. */
const MAX_MESSAGE_BYTES = 64 * 1024;
const RELAYED = new Set(["OFFER", "ANSWER", "CANDIDATE", "LEAVE"]);

type Attachment = { id: string; token: string };

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/peerjs") return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    if (!originAllowed(request.headers.get("Origin"), env.ALLOWED_ORIGINS)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const room = roomForPeerId(url.searchParams.get("id") ?? "");
    if (!room || !url.searchParams.get("token")) return new Response("Bad peer id", { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** One room: the host and its guests. Uses WebSocket hibernation, so an idle room costs nothing. */
export class SignalRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer client heartbeats without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"HEARTBEAT"}', '{"type":"HEARTBEAT"}'),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")!;
    const token = url.searchParams.get("token")!;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [id]);

    // Only accepted sockets carry an attachment; rejected ones are on their way out.
    const existing = this.ctx.getWebSockets(id).filter((ws) => ws !== server && ws.deserializeAttachment());
    if (existing.some((ws) => (ws.deserializeAttachment() as Attachment).token !== token)) {
      // Someone else holds this id (e.g. the room code is in use).
      server.send(JSON.stringify({ type: "ID-TAKEN", payload: { msg: "ID is taken" } }));
      server.close(1008, "ID is taken");
    } else if (this.ctx.getWebSockets().length > MAX_PEERS) {
      server.send(JSON.stringify({ type: "ERROR", payload: { msg: "Room is full" } }));
      server.close(1008, "Room is full");
    } else {
      // Same id and token: the client reconnected. The new socket replaces the old.
      for (const ws of existing) ws.close(1000, "Replaced");
      server.serializeAttachment({ id, token } satisfies Attachment);
      server.send(JSON.stringify({ type: "OPEN" }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    const from = ws.deserializeAttachment() as Attachment | null;
    if (!from) return;
    let msg: { type?: string; dst?: string; payload?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg.type || !RELAYED.has(msg.type) || typeof msg.dst !== "string") return;

    const target = this.ctx.getWebSockets(msg.dst).find((s) => s.deserializeAttachment());
    if (target) {
      target.send(JSON.stringify({ type: msg.type, src: from.id, dst: msg.dst, payload: msg.payload }));
    } else if (msg.type === "OFFER") {
      ws.send(JSON.stringify({ type: "EXPIRE", src: msg.dst, dst: from.id }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    // Complete the close handshake; nothing else to clean up.
    try {
      ws.close(code === 1005 ? 1000 : code, "Closed");
    } catch {}
  }
}
