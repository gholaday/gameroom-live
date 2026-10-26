import type { DataConnection, Peer } from "peerjs";
import type { Nostalgist } from "nostalgist";
import { installAudioTap, type AudioTap } from "@/lib/emulator/audio-tap";
import { coreForFile, selfHostedCores } from "@/lib/emulator/cores";
import { InputInjector, REMOTE_PLAYERS, remoteBindingsConfig } from "@/lib/emulator/injector";
import { pinCanvasSize } from "@/lib/emulator/pin-canvas";
import { HOST_PEER, stampPeer } from "@/lib/net/overlay";
import type { OverlayController } from "@/lib/overlay/controller";
import { getName } from "@/lib/identity";
import { preferCodec } from "@/lib/net/codecs";
import { fetchIceConfig, PeerLink } from "@/lib/net/link";
import {
  decodeInput,
  seqNewer,
  type ControlMessage,
  type Game,
  type InputState,
  type OverlayPeer,
  type PlayerInfo,
} from "@/lib/net/protocol";
import { MAX_GUESTS, newRoomCode, peerIdFor } from "@/lib/net/room";

// The host's side of a room: PeerJS signaling, one PeerLink per guest, the
// emulator, and the input path from guests into RetroArch. Plain module state,
// not React: React reads snapshots through useSyncExternalStore, and only on
// meaningful changes (joins, slots, about once a second for RTT).

/** SNES native 256x224 at 2x. */
export const STREAM_SIZE = { width: 512, height: 448 };
const STREAM_MAX_BITRATE = 4_000_000;
/** Zero a player's buttons if their packets stop (tab hidden, network drop). */
const INPUT_TIMEOUT_MS = 250;
const ROOM_KEY = "gameroom-room";

type Guest = {
  id: string;
  name: string;
  link: PeerLink;
  /** 0 = spectator. */
  slot: number;
  seq: number;
  hasSeq: boolean;
  lastInputAt: number;
  input: InputState;
  hasMedia: boolean;
  /** Pointer and ink identity, 1..255. */
  overlayId: number;
};

export type HostSnapshot = {
  status: "idle" | "opening" | "open" | "error";
  error: string | null;
  code: string | null;
  hostName: string;
  players: PlayerInfo[];
  spectators: number;
  rom: { file: File; game: Game } | null;
  running: boolean;
};

class HostSession {
  private snapshot: HostSnapshot = {
    status: "idle",
    error: null,
    code: null,
    hostName: "Host",
    players: [],
    spectators: 0,
    rom: null,
    running: false,
  };
  private readonly listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private readonly guests = new Map<string, Guest>();
  private emu: Nostalgist | null = null;
  private tap: AudioTap | null = null;
  private injector: InputInjector | null = null;
  private stream: MediaStream | null = null;
  private timers: number[] = [];
  private overlay: OverlayController | null = null;
  private peers: OverlayPeer[] = [];

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<HostSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Opens the room. Safe to call repeatedly. */
  async open() {
    if (this.peer || this.snapshot.status === "opening") return;
    this.set({ status: "opening", error: null, hostName: getName("Host") });
    const { Peer } = await import("peerjs");
    const config = await fetchIceConfig();

    let code = readRoom() ?? newRoomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const peer = new Peer(peerIdFor(code), { config, debug: 0 });
      const result = await new Promise<"open" | "taken" | Error>((resolve) => {
        peer.once("open", () => resolve("open"));
        peer.once("error", (err) =>
          resolve((err as { type?: string }).type === "unavailable-id" ? "taken" : err),
        );
      });
      if (result === "open") {
        this.peer = peer;
        writeRoom(code);
        peer.on("connection", (conn) => this.accept(conn));
        peer.on("disconnected", () => peer.reconnect());
        this.set({ status: "open", code });
        this.startTimers();
        this.publishPlayers();
        return;
      }
      peer.destroy();
      if (result !== "taken") {
        this.set({ status: "error", error: result.message });
        return;
      }
      code = newRoomCode();
    }
    this.set({ status: "error", error: "Could not get a free room code." });
  }

  setRom(file: File): string | null {
    if (!coreForFile(file.name)) return "Only SNES ROMs (.sfc, .smc) work right now.";
    const title = file.name.replace(/\.[^.]+$/, "").replace(/\s*\([^)]*\)/g, "");
    this.set({ rom: { file, game: { title, system: "Super Nintendo" } } });
    return null;
  }

  /** Boots the ROM into `canvas` and starts streaming. No-op if already running. */
  async boot(canvas: HTMLCanvasElement) {
    const rom = this.snapshot.rom;
    if (!rom || this.emu) return;
    const core = coreForFile(rom.file.name)!;
    pinCanvasSize(canvas, STREAM_SIZE.width, STREAM_SIZE.height);
    this.tap = installAudioTap();

    const { Nostalgist } = await import("nostalgist");
    this.emu = await Nostalgist.launch({
      core,
      rom: rom.file,
      element: canvas,
      size: STREAM_SIZE,
      ...selfHostedCores,
      retroarchConfig: {
        video_smooth: false,
        // 1:1 PAR: 256x224 fills 512x448 at exactly 2x. See docs/m1-spike-notes.md.
        aspect_ratio_index: 21,
        ...remoteBindingsConfig(),
      },
    });
    this.injector = new InputInjector(this.emu);

    const stream = canvas.captureStream(60);
    stream.getVideoTracks()[0].contentHint = "motion";
    // The tap resolves when the core creates its AudioContext, during launch.
    const audio = await Promise.race([
      this.tap.stream,
      new Promise<null>((r) => setTimeout(() => r(null), 1000)),
    ]);
    audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
    this.stream = stream;

    this.set({ running: true });
    this.broadcast({ t: "game", game: rom.game });
    for (const guest of this.guests.values()) void this.sendMedia(guest);
  }

  pause() {
    this.emu?.pause();
  }
  resume() {
    this.emu?.resume();
  }

  /** Ends the session for everyone. */
  end() {
    this.broadcast({ t: "end" });
    for (const g of this.guests.values()) g.link.close();
    this.guests.clear();
    this.emu?.exit({ removeCanvas: false });
    this.tap?.uninstall();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.timers.forEach(clearInterval);
    this.peer?.destroy();
    clearRoom();
    this.emu = this.tap = this.injector = this.stream = this.peer = null;
    this.timers = [];
    this.set({ status: "idle", code: null, players: [], spectators: 0, rom: null, running: false });
  }

  /** Shows guests' hands and ink on the host view; the host's own go to everyone. */
  attachOverlay(overlay: OverlayController) {
    this.overlay = overlay;
    overlay.setPeers(this.peers, HOST_PEER);
    return () => {
      if (this.overlay === overlay) this.overlay = null;
    };
  }

  /** Sink for the host's own pointer: peer 0 is already in the packet. */
  readonly overlaySink = {
    cursor: (packet: DataView<ArrayBuffer>) => {
      for (const g of this.guests.values()) g.link.sendCursor(packet);
    },
    ink: (packet: ArrayBuffer) => {
      for (const g of this.guests.values()) g.link.sendInk(packet);
    },
  };

  /** Worst guest RTT and the first guest's outbound video fps, for the host pill. */
  async sampleStats(): Promise<{ rttMs: number; fps: number | null; guests: number }> {
    let rttMs = 0;
    let fps: number | null = null;
    for (const g of this.guests.values()) {
      rttMs = Math.max(rttMs, g.link.rttMs);
      if (fps === null && g.hasMedia) {
        const stats = await g.link.pc.getStats();
        stats.forEach((s) => {
          if (s.type === "outbound-rtp" && s.kind === "video" && s.framesPerSecond) fps = s.framesPerSecond;
        });
      }
    }
    return { rttMs, fps, guests: this.guests.size };
  }

  // ---------- Guests ----------

  private accept(conn: DataConnection) {
    if (this.guests.size >= MAX_GUESTS) {
      conn.on("open", () => conn.close());
      return;
    }
    conn.on("open", () => {
      const used = new Set([...this.guests.values()].map((g) => g.overlayId));
      let overlayId = 1;
      while (used.has(overlayId) && overlayId < 255) overlayId++;
      const guest: Guest = {
        id: conn.peer,
        overlayId,
        name: "Guest",
        slot: 0,
        seq: 0,
        hasSeq: false,
        lastInputAt: 0,
        input: { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 },
        hasMedia: false,
        link: new PeerLink(conn, {
          onControl: (msg) => this.onControl(guest, msg),
          onInput: (view) => this.onInput(guest, view),
          onCursor: (buf) => this.relay(guest, buf, "cursor"),
          onInk: (buf) => this.relay(guest, buf, "ink"),
          onClose: () => this.drop(guest),
        }),
      };
      this.guests.set(guest.id, guest);
    });
  }

  private onControl(guest: Guest, msg: ControlMessage) {
    switch (msg.t) {
      case "hello":
        guest.name = msg.name.slice(0, 24) || "Guest";
        guest.link.sendControl({
          t: "welcome",
          hostName: this.snapshot.hostName,
          game: this.snapshot.running ? (this.snapshot.rom?.game ?? null) : null,
          players: this.snapshot.players,
          spectators: this.snapshot.spectators,
        });
        // Everyone gets the stream, players and spectators alike.
        if (this.stream) void this.sendMedia(guest);
        this.publishPlayers();
        break;
      case "claim": {
        if (guest.slot) break;
        const taken = new Set([...this.guests.values()].map((g) => g.slot));
        const slot = REMOTE_PLAYERS.find((s) => !taken.has(s)) ?? 0;
        guest.slot = slot;
        guest.hasSeq = false;
        guest.link.sendControl({ t: "slot", slot });
        this.publishPlayers();
        break;
      }
      case "unclaim":
        this.release(guest);
        guest.slot = 0;
        guest.link.sendControl({ t: "slot", slot: 0 });
        this.publishPlayers();
        break;
    }
  }

  /** Hot path. Newest packet wins; apply immediately, edges only. */
  private onInput(guest: Guest, view: DataView) {
    if (!guest.slot || !this.injector) return;
    const seq = view.getUint16(0);
    if (guest.hasSeq && !seqNewer(seq, guest.seq)) return;
    decodeInput(view, guest.input);
    guest.seq = seq;
    guest.hasSeq = true;
    guest.lastInputAt = performance.now();
    this.injector.apply(guest.slot, guest.input.buttons);
  }

  /** Stamp the sender, show it here, and pass it to everyone else. */
  private relay(from: Guest, buf: ArrayBuffer, kind: "cursor" | "ink") {
    stampPeer(buf, from.overlayId);
    if (kind === "cursor") this.overlay?.remoteCursor(buf);
    else this.overlay?.remoteInk(buf);
    for (const g of this.guests.values()) {
      if (g === from) continue;
      if (kind === "cursor") g.link.sendCursor(buf);
      else g.link.sendInk(buf);
    }
  }

  private release(guest: Guest) {
    if (guest.slot) this.injector?.releaseAll(guest.slot);
  }

  private drop(guest: Guest) {
    this.release(guest);
    this.guests.delete(guest.id);
    this.publishPlayers();
  }

  private async sendMedia(guest: Guest) {
    if (!this.stream || guest.hasMedia) return;
    guest.hasMedia = true;
    const { pc } = guest.link;
    for (const track of this.stream.getTracks()) {
      const tx = pc.addTransceiver(track, { direction: "sendonly", streams: [this.stream] });
      if (track.kind === "video") {
        const caps = RTCRtpReceiver.getCapabilities("video")?.codecs ?? [];
        tx.setCodecPreferences(preferCodec(caps, "video/H264"));
      }
    }
    await guest.link.renegotiate();
    // Encoder settings apply once the sender is negotiated.
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters();
      params.degradationPreference = "maintain-framerate";
      for (const enc of params.encodings) {
        enc.maxBitrate = STREAM_MAX_BITRATE;
        enc.maxFramerate = 60;
        enc.priority = "high";
        enc.networkPriority = "high";
      }
      await sender.setParameters(params).catch(() => {});
    }
  }

  private broadcast(msg: ControlMessage) {
    for (const g of this.guests.values()) g.link.sendControl(msg);
  }

  private publishPlayers() {
    const players: PlayerInfo[] = [{ slot: 1, name: this.snapshot.hostName, isHost: true }];
    let spectators = 0;
    for (const g of this.guests.values()) {
      if (g.slot) players.push({ slot: g.slot, name: g.name, rttMs: Math.round(g.link.rttMs) });
      else spectators++;
    }
    players.sort((a, b) => a.slot - b.slot);
    this.publishPeers();
    const prev = this.snapshot;
    const same =
      prev.spectators === spectators &&
      prev.players.length === players.length &&
      prev.players.every((p, i) => p.slot === players[i].slot && p.name === players[i].name && p.rttMs === players[i].rttMs);
    if (same) return;
    this.set({ players, spectators });
    this.broadcast({ t: "players", players, spectators });
  }

  private publishPeers() {
    const peers: OverlayPeer[] = [{ id: HOST_PEER, name: this.snapshot.hostName, slot: 1 }];
    for (const g of this.guests.values()) peers.push({ id: g.overlayId, name: g.name, slot: g.slot });
    const prev = this.peers;
    if (prev.length === peers.length && prev.every((p, i) => p.id === peers[i].id && p.name === peers[i].name && p.slot === peers[i].slot)) return;
    this.peers = peers;
    this.overlay?.setPeers(peers, HOST_PEER);
    for (const g of this.guests.values()) g.link.sendControl({ t: "peers", peers, self: g.overlayId });
  }

  private startTimers() {
    // Release stuck buttons when a player's packets stop arriving.
    this.timers.push(
      window.setInterval(() => {
        const now = performance.now();
        for (const g of this.guests.values()) {
          if (g.slot && g.input.buttons && now - g.lastInputAt > INPUT_TIMEOUT_MS) {
            g.input.buttons = 0;
            this.release(g);
          }
        }
      }, 50),
    );
    // RTT in the player list, at most once a second.
    this.timers.push(window.setInterval(() => this.publishPlayers(), 1000));
  }
}

function readRoom() {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}
function writeRoom(code: string) {
  try {
    sessionStorage.setItem(ROOM_KEY, code);
  } catch {}
}
function clearRoom() {
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch {}
}

export const hostSession = new HostSession();

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __gameroomHost: HostSession }).__gameroomHost = hostSession;
}
