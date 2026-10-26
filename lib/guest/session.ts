import type { Peer } from "peerjs";
import { getName, setName, tabToken } from "@/lib/identity";
import { keyMask, padMasksFor } from "@/lib/input/controls";
import { readGamepad } from "@/lib/input/retropad";
import { iceReport } from "@/lib/net/ice-report";
import { ICE_CONFIG, PeerLink } from "@/lib/net/link";
import { guestPeerId, signalingOptions } from "@/lib/net/signaling";
import {
  CHAT_HISTORY,
  chatText,
  encodeInput,
  INPUT_BYTES,
  PRESENCE_HISTORY,
  type ChatLine,
  type ControlMessage,
  type Game,
  type InputState,
  type OverlayPeer,
  type PlayerInfo,
  type PresenceEvent,
} from "@/lib/net/protocol";
import type { OverlayController } from "@/lib/overlay/controller";
import { peerIdFor } from "@/lib/net/room";

// The guest's side: connect to the host's room, show the stream, and (once a
// slot is claimed) send the full controller state every frame. Sending full
// state rather than edges means a lost packet can never stick a button.

/** Resend unchanged state at this interval so the host's 250 ms timeout never trips. */
const HEARTBEAT_MS = 1000 / 60;
/** How long to keep trying after the host drops before calling it over. */
const HOST_GRACE_MS = 30_000;
const RETRY_MS = 2000;
/**
 * A backstop: ICE reports "failed" by itself, and a slow path (a phone on the
 * host's Wi-Fi, say) can still be checking well past 8 s.
 */
const CONNECT_TIMEOUT_MS = 25_000;
const SIGNALING_TIMEOUT_MS = 10_000;

export type InputMode = "gamepad" | "keyboard" | "touch";

export type GuestSnapshot = {
  /**
   * "connecting": reaching the signaling server. "reaching": it found the
   * room, now opening the direct connection to the host.
   * "waiting": the host dropped and we're retrying for up to 30 s.
   */
  status: "connecting" | "reaching" | "connected" | "waiting" | "ended" | "kicked" | "error";
  error: string | null;
  /** Technical detail under the error, such as which addresses were tried. */
  errorDetail?: string;
  hostName: string;
  game: Game | null;
  players: PlayerInfo[];
  spectators: number;
  /** 0 = spectating. */
  slot: number;
  claiming: boolean;
  stream: MediaStream | null;
  /** Recent chat, oldest first. */
  chat: ChatLine[];
  /** Others joining and leaving since we connected, oldest first. */
  presence: PresenceEvent[];
};

export class GuestSession {
  private snapshot: GuestSnapshot = {
    status: "connecting",
    error: null,
    hostName: "Host",
    game: null,
    players: [],
    spectators: 0,
    slot: 0,
    claiming: false,
    stream: null,
    chat: [],
    presence: [],
  };
  private readonly listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private link: PeerLink | null = null;
  private mode: InputMode = "gamepad";
  /** The spot picked in the lobby, asked for again on reconnect. */
  private pickedSlot = 0;
  private raf = 0;
  private seq = 0;
  private lastSent = 0;
  private readonly state: InputState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
  private readonly sent: InputState = { buttons: -1, lx: 0, ly: 0, rx: 0, ry: 0 };
  private readonly packet = new DataView(new ArrayBuffer(INPUT_BYTES));
  private keyButtons = 0;
  private touchButtons = 0;
  private overlay: OverlayController | null = null;
  private peers: OverlayPeer[] = [];
  private selfId = 0;
  /** Bumped by connect/close so a stale async connect (React Strict Mode) bows out. */
  private gen = 0;
  /** When the host dropped, for the grace period. 0 while connected. */
  private droppedAt = 0;
  private retryTimer = 0;
  /** Had (or asked for) a slot. After a host reload, which forgets slots, ask again. */
  private wantSlot = false;
  /** Host encode time per frame, from the host's `stats` messages. */
  encodeMs = 0;

  constructor(private readonly code: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  get rttMs() {
    return this.link?.rttMs ?? 0;
  }
  get pc() {
    return this.link?.pc ?? null;
  }
  get inputMode() {
    return this.mode;
  }

  private set(patch: Partial<GuestSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  async connect() {
    const gen = ++this.gen;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __gameroomGuest: GuestSession }).__gameroomGuest = this;
    }
    const { Peer } = await import("peerjs");
    const config = ICE_CONFIG;
    if (gen !== this.gen) return;
    if (!this.droppedAt) this.set({ status: "connecting", error: null, errorDetail: undefined });
    const peer = new Peer(guestPeerId(this.code), { config, debug: 0, ...signalingOptions() });
    this.peer = peer;
    // The signaling socket can hang without an error (a blocked network, say).
    setTimeout(() => {
      if (gen !== this.gen || this.peer !== peer || peer.open) return;
      if (this.droppedAt) this.retry(gen);
      else this.set({ status: "error", error: "Could not reach the room server. Check your connection and try again." });
    }, SIGNALING_TIMEOUT_MS);
    peer.on("error", (err) => {
      if (gen !== this.gen || this.peer !== peer) return;
      const type = (err as { type?: string }).type;
      // While waiting out a host drop, the room being gone is expected: retry.
      if (this.droppedAt) return this.retry(gen);
      this.set({
        status: "error",
        error:
          type === "peer-unavailable"
            ? "This room is closed or the code is wrong."
            : // The signaling server caps how many can be in one room.
              err.message === "Room is full"
              ? "This room is full. Ask the host to make room."
              : err.message,
      });
    });
    peer.on("open", () => {
      if (!this.droppedAt) this.set({ status: "reaching" });
      const conn = peer.connect(peerIdFor(this.code), { reliable: true, serialization: "json" });
      const link = new PeerLink(conn, {
        onControl: (msg) => this.onControl(msg),
        onCursor: (buf) => this.overlay?.remoteCursor(buf),
        onInk: (buf) => this.overlay?.remoteInk(buf),
        onClose: () => {
          if (gen !== this.gen || this.link !== link) return;
          this.stopInput();
          const s = this.snapshot.status;
          if (s === "ended" || s === "kicked") return;
          // Unexpected drop: the host may be refreshing. Hold on for a bit.
          if (!this.droppedAt) this.droppedAt = performance.now();
          this.set({ status: "waiting", stream: null, slot: 0, claiming: false });
          this.retry(gen);
        },
      });
      this.link = link;
      link.pc.addEventListener("track", (e) => this.onTrack(e));
      // The room exists but no direct path to the host worked, or the attempt
      // hung (e.g. reaching a host that just reloaded). Either way, say so,
      // with which addresses were tried, since a phone has no console.
      let failing = false;
      const fail = async () => {
        if (failing || gen !== this.gen || this.link !== link || conn.open) return;
        if (this.droppedAt) return this.retry(gen);
        failing = true;
        const report = iceReport((await link.pc.getStats().catch(() => new Map())).values());
        if (gen !== this.gen || this.link !== link || conn.open) return;
        console.warn("gameroom: no connection to the host.", report);
        this.set({
          status: "error",
          error: "Found the room but couldn't connect to the host. Some networks, like mobile data, block this; try Wi-Fi.",
          errorDetail: `${link.pc.iceConnectionState}. ${report}`,
        });
      };
      link.pc.addEventListener("iceconnectionstatechange", () => {
        if (link.pc.iceConnectionState === "failed") void fail();
      });
      setTimeout(() => void fail(), CONNECT_TIMEOUT_MS);
      conn.on("open", () => {
        if (gen !== this.gen) return;
        const reconnect = !!this.droppedAt;
        this.droppedAt = 0;
        this.set({ status: "connected" });
        link.sendControl({ t: "hello", name: getName("Guest"), token: tabToken(this.code) });
        // The host ignores this if the hello already got our slot back.
        if (reconnect && this.wantSlot) link.sendControl({ t: "claim", slot: this.pickedSlot });
      });
    });
  }

  /** Tears down the current attempt and tries again, until the grace period runs out. */
  private retry(gen: number) {
    if (gen !== this.gen || this.retryTimer) return;
    if (performance.now() - this.droppedAt > HOST_GRACE_MS) {
      this.teardown();
      this.set({ status: "ended" });
      return;
    }
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      if (gen !== this.gen) return;
      this.teardown();
      void this.connect();
    }, RETRY_MS);
  }

  /**
   * Ask for a controller slot, `slot` if it's still open. Input starts flowing
   * once the host assigns one. A player picking another open spot moves there.
   */
  claim(mode: InputMode, slot = 0) {
    this.mode = mode;
    this.pickedSlot = slot;
    this.wantSlot = true;
    if (this.snapshot.slot) {
      this.stopInput();
      this.startInput();
      if (slot && slot !== this.snapshot.slot) this.link?.sendControl({ t: "claim", slot });
      return;
    }
    this.set({ claiming: true });
    this.link?.sendControl({ t: "claim", slot });
  }

  /** Give up the slot and spectate. */
  watch() {
    this.stopInput();
    this.wantSlot = false;
    if (this.snapshot.slot) this.link?.sendControl({ t: "unclaim" });
    this.set({ claiming: false });
  }

  /** Posts to the room's chat; the host echoes it back to everyone, us included. */
  say(raw: string) {
    const text = chatText(raw);
    if (text) this.link?.sendControl({ t: "say", text });
  }

  rename(name: string) {
    setName(name);
    this.link?.sendControl({ t: "name", name: getName("Guest") });
  }

  /** Touch pad state. Sent right away, like keyboard events. */
  setTouchButtons(mask: number) {
    if (mask === this.touchButtons) return;
    this.touchButtons = mask;
    if (this.mode !== "touch" || !this.raf) return;
    this.state.buttons = mask;
    this.send(performance.now());
  }

  attachOverlay(overlay: OverlayController) {
    this.overlay = overlay;
    overlay.setPeers(this.peers, this.selfId);
    return () => {
      if (this.overlay === overlay) this.overlay = null;
    };
  }

  /** Our pointer and ink go to the host, which relays them to everyone else. */
  readonly overlaySink = {
    cursor: (packet: DataView<ArrayBuffer>) => this.link?.sendCursor(packet),
    ink: (packet: ArrayBuffer) => this.link?.sendInk(packet),
  };

  close() {
    this.gen++;
    this.stopInput();
    this.teardown();
  }

  private teardown() {
    clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    // Null first, so the close events below read as ours, not a drop.
    const { link, peer } = this;
    this.link = null;
    this.peer = null;
    link?.close();
    peer?.destroy();
  }

  private onControl(msg: ControlMessage) {
    switch (msg.t) {
      case "welcome":
        this.set({
          hostName: msg.hostName,
          game: msg.game,
          players: msg.players,
          spectators: msg.spectators,
          chat: msg.chat ?? this.snapshot.chat,
        });
        break;
      case "players":
        this.set({ players: msg.players, spectators: msg.spectators });
        break;
      case "game":
        this.set({ game: msg.game });
        break;
      case "slot":
        this.wantSlot = msg.slot > 0;
        this.set({ slot: msg.slot, claiming: false });
        if (msg.slot) this.startInput();
        else this.stopInput();
        break;
      case "peers":
        this.peers = msg.peers;
        this.selfId = msg.self;
        this.overlay?.setPeers(msg.peers, msg.self);
        break;
      case "stats":
        this.encodeMs = msg.encodeMs;
        break;
      case "chat":
        this.set({ chat: [...this.snapshot.chat, msg.line].slice(-CHAT_HISTORY) });
        break;
      case "presence":
        this.set({ presence: [...this.snapshot.presence, msg.event].slice(-PRESENCE_HISTORY) });
        break;
      case "kicked":
        this.gen++;
        this.stopInput();
        this.teardown();
        this.set({ status: "kicked", stream: null });
        break;
      case "end":
        this.gen++;
        this.stopInput();
        this.teardown();
        this.set({ status: "ended", stream: null });
        break;
    }
  }

  private onTrack(e: RTCTrackEvent) {
    // Play frames the moment they decode. Never queue on the guest.
    e.receiver.jitterBufferTarget = 0;
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    if (this.snapshot.stream !== stream) this.set({ stream });
  }

  // ---------- Input loop ----------

  private onKey = (e: KeyboardEvent) => {
    const mask = keyMask(e.code);
    if (!mask || e.repeat) return;
    e.preventDefault();
    this.keyButtons = e.type === "keydown" ? this.keyButtons | mask : this.keyButtons & ~mask;
    // Send on the event itself: no wait for the next frame, and a tap shorter
    // than a frame still reaches the host.
    this.state.buttons = this.keyButtons;
    this.send(performance.now());
  };
  private onBlur = () => {
    this.keyButtons = 0;
  };

  private startInput() {
    if (this.raf) return;
    if (this.mode === "keyboard") {
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }
    this.sent.buttons = -1;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopInput() {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    // One last all-released packet so nothing stays held.
    this.keyButtons = 0;
    this.state.buttons = this.state.lx = this.state.ly = this.state.rx = this.state.ry = 0;
    this.send(performance.now());
  }

  /** Polls once per display frame; sends on change, or as a heartbeat. */
  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const s = this.state;
    if (this.mode === "keyboard" || this.mode === "touch") {
      s.buttons = this.mode === "keyboard" ? this.keyButtons : this.touchButtons;
      s.lx = s.ly = s.rx = s.ry = 0;
    } else {
      const pad = firstPad();
      if (pad) readGamepad(pad, s, padMasksFor(pad.id));
      else s.buttons = s.lx = s.ly = s.rx = s.ry = 0;
    }
    const t = this.sent;
    const changed = s.buttons !== t.buttons || s.lx !== t.lx || s.ly !== t.ly || s.rx !== t.rx || s.ry !== t.ry;
    if (changed || now - this.lastSent >= HEARTBEAT_MS) this.send(now);
  };

  private send(now: number) {
    if (!this.link) return;
    this.seq = (this.seq + 1) & 0xffff;
    encodeInput(this.seq, this.state, this.packet);
    this.link.sendInput(this.packet);
    Object.assign(this.sent, this.state);
    this.lastSent = now;
  }
}

function firstPad(): Gamepad | null {
  for (const pad of navigator.getGamepads()) if (pad?.connected) return pad;
  return null;
}
