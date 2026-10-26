import type { Peer } from "peerjs";
import { getName } from "@/lib/identity";
import { KEYBOARD, readGamepad } from "@/lib/input/retropad";
import { fetchIceConfig, PeerLink } from "@/lib/net/link";
import {
  encodeInput,
  INPUT_BYTES,
  type ControlMessage,
  type Game,
  type InputState,
  type OverlayPeer,
  type PlayerInfo,
} from "@/lib/net/protocol";
import type { OverlayController } from "@/lib/overlay/controller";
import { peerIdFor } from "@/lib/net/room";

// The guest's side: connect to the host's room, show the stream, and (once a
// slot is claimed) send the full controller state every frame. Sending full
// state rather than edges means a lost packet can never stick a button.

/** Resend unchanged state at this interval so the host's 250 ms timeout never trips. */
const HEARTBEAT_MS = 1000 / 60;

export type InputMode = "gamepad" | "keyboard";

export type GuestSnapshot = {
  status: "connecting" | "connected" | "ended" | "error";
  error: string | null;
  hostName: string;
  game: Game | null;
  players: PlayerInfo[];
  spectators: number;
  /** 0 = spectating. */
  slot: number;
  claiming: boolean;
  stream: MediaStream | null;
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
  };
  private readonly listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private link: PeerLink | null = null;
  private mode: InputMode = "gamepad";
  private raf = 0;
  private seq = 0;
  private lastSent = 0;
  private readonly state: InputState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
  private readonly sent: InputState = { buttons: -1, lx: 0, ly: 0, rx: 0, ry: 0 };
  private readonly packet = new DataView(new ArrayBuffer(INPUT_BYTES));
  private keyButtons = 0;
  private overlay: OverlayController | null = null;
  private peers: OverlayPeer[] = [];
  private selfId = 0;
  /** Bumped by connect/close so a stale async connect (React Strict Mode) bows out. */
  private gen = 0;

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
    const config = await fetchIceConfig();
    if (gen !== this.gen) return;
    this.set({ status: "connecting", error: null });
    const peer = new Peer({ config, debug: 0 });
    this.peer = peer;
    peer.on("error", (err) => {
      const type = (err as { type?: string }).type;
      this.set({
        status: "error",
        error: type === "peer-unavailable" ? "This room is closed or the code is wrong." : err.message,
      });
    });
    peer.on("open", () => {
      const conn = peer.connect(peerIdFor(this.code), { reliable: true, serialization: "json" });
      const link = new PeerLink(conn, {
        onControl: (msg) => this.onControl(msg),
        onCursor: (buf) => this.overlay?.remoteCursor(buf),
        onInk: (buf) => this.overlay?.remoteInk(buf),
        onClose: () => {
          if (gen !== this.gen) return;
          this.stopInput();
          if (this.snapshot.status !== "ended") this.set({ status: "ended" });
        },
      });
      this.link = link;
      link.pc.addEventListener("track", (e) => this.onTrack(e));
      conn.on("open", () => {
        this.set({ status: "connected" });
        link.sendControl({ t: "hello", name: getName("Guest") });
      });
    });
  }

  /** Ask for a controller slot. Input starts flowing once the host assigns one. */
  claim(mode: InputMode) {
    this.mode = mode;
    if (this.snapshot.slot) {
      this.startInput();
      return;
    }
    this.set({ claiming: true });
    this.link?.sendControl({ t: "claim" });
  }

  /** Give up the slot and spectate. */
  watch() {
    this.stopInput();
    if (this.snapshot.slot) this.link?.sendControl({ t: "unclaim" });
    this.set({ claiming: false });
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
    this.link?.close();
    this.peer?.destroy();
    this.link = null;
    this.peer = null;
  }

  private onControl(msg: ControlMessage) {
    switch (msg.t) {
      case "welcome":
        this.set({ hostName: msg.hostName, game: msg.game, players: msg.players, spectators: msg.spectators });
        break;
      case "players":
        this.set({ players: msg.players, spectators: msg.spectators });
        break;
      case "game":
        this.set({ game: msg.game });
        break;
      case "slot":
        this.set({ slot: msg.slot, claiming: false });
        if (msg.slot) this.startInput();
        else this.stopInput();
        break;
      case "peers":
        this.peers = msg.peers;
        this.selfId = msg.self;
        this.overlay?.setPeers(msg.peers, msg.self);
        break;
      case "end":
        this.stopInput();
        this.set({ status: "ended" });
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
    const mask = KEYBOARD[e.code];
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
    if (this.mode === "keyboard") {
      s.buttons = this.keyButtons;
      s.lx = s.ly = s.rx = s.ry = 0;
    } else {
      const pad = firstPad();
      if (pad) readGamepad(pad, s);
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
