import type { DataConnection, Peer } from "peerjs";
import type { Nostalgist } from "nostalgist";
import { installAudioTap, type AudioTap } from "@/lib/emulator/audio-tap";
import { selfHostedCores } from "@/lib/emulator/cores";
import { InputInjector, remoteBindingsConfig, remotePlayers } from "@/lib/emulator/injector";
import { ROM_ACCEPT, type System } from "@/lib/emulator/systems";
import { pinCanvasSize } from "@/lib/emulator/pin-canvas";
import { SlotReservations } from "@/lib/host/reservations";
import { listSaves, writeSave, type SaveSlot } from "@/lib/host/saves-store";
import { clearResume, loadResume, saveResumeRom, saveResumeState } from "@/lib/host/resume-store";
import { getName, MAX_NAME, setName } from "@/lib/identity";
import { gameForFile } from "@/lib/library/games";
import { preferCodec } from "@/lib/net/codecs";
import { perFrameMs } from "@/lib/net/latency";
import { fetchIceConfig, PeerLink } from "@/lib/net/link";
import { signalingOptions } from "@/lib/net/signaling";
import { HOST_PEER, stampPeer } from "@/lib/net/overlay";
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
import type { OverlayController } from "@/lib/overlay/controller";

// The host's side of a room: PeerJS signaling, one PeerLink per guest, the
// emulator, and the input path from guests into RetroArch. Plain module state,
// not React: React reads snapshots through useSyncExternalStore, and only on
// meaningful changes (joins, slots, about once a second for RTT).

const STREAM_MAX_BITRATE = 4_000_000;
/** Zero a player's buttons if their packets stop (tab hidden, network drop). */
const INPUT_TIMEOUT_MS = 250;
/** A dropped player's slot waits this long for them to reconnect. */
const SLOT_HOLD_MS = 60_000;
/** Save a resume state this often while playing. */
const AUTOSAVE_MS = 10_000;
const ROOM_KEY = "gameroom-room";

type Guest = {
  id: string;
  token: string;
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
  /** Kicked or replaced: don't hold a slot for this connection when it closes. */
  forget: boolean;
  /** Previous encoder counters, for per-frame encode time. */
  enc: { time: number; frames: number };
};

export type GuestInfo = { id: string; name: string; slot: number; rttMs: number };

export type HostSnapshot = {
  status: "idle" | "opening" | "open" | "error";
  error: string | null;
  code: string | null;
  hostName: string;
  players: PlayerInfo[];
  spectators: number;
  /** Everyone connected, players and spectators. */
  guests: GuestInfo[];
  rom: { file: File; game: Game; system: System } | null;
  /** True when the ROM came from a resume record and will boot from its state. */
  resuming: boolean;
  /** False until the resume record has been checked, so /play doesn't flash "No game". */
  restored: boolean;
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
    guests: [],
    rom: null,
    resuming: false,
    restored: false,
    running: false,
  };
  private readonly listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private readonly guests = new Map<string, Guest>();
  private readonly reservations = new SlotReservations(SLOT_HOLD_MS);
  private emu: Nostalgist | null = null;
  private tap: AudioTap | null = null;
  private injector: InputInjector | null = null;
  private stream: MediaStream | null = null;
  private timers: number[] = [];
  private overlay: OverlayController | null = null;
  private peers: OverlayPeer[] = [];
  private resumeState: Blob | null = null;
  private restored = false;
  /**
   * The emulator's canvas lives as long as the session, not the play screen:
   * leaving /play detaches it and coming back re-attaches the same, still
   * running framebuffer.
   */
  private canvas: HTMLCanvasElement | null = null;
  /**
   * Nostalgist saves and loads through one shared state file, so overlapping
   * operations (autosave during a slot load) clobber each other. Run them in turn.
   */
  private stateQueue: Promise<unknown> = Promise.resolve();

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

    // After a refresh, reclaim the same code so guests reconnect to it. The
    // broker can take a moment to free the old id, so retry it before giving up.
    const saved = readRoom();
    let code = saved ?? newRoomCode();
    let sameCodeTries = saved ? 6 : 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const peer = new Peer(peerIdFor(code), { config, debug: 0, ...signalingOptions() });
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
        peer.on("disconnected", () => {
          if (!peer.destroyed) peer.reconnect();
        });
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
      if (sameCodeTries-- > 0) await new Promise((r) => setTimeout(r, 1500));
      else code = newRoomCode();
    }
    this.set({ status: "error", error: "Could not get a free room code." });
  }

  /** Loads the resume record, if any, as the current ROM. Runs once per page load. */
  async restore() {
    if (this.restored) return;
    this.restored = true;
    const rec = await loadResume();
    if (rec && !this.snapshot.rom) {
      this.resumeState = rec.state;
      this.setRom(new File([rec.rom], rec.romName), { persist: false });
    }
    this.set({ restored: true, resuming: !!rec?.state && !this.snapshot.running });
  }

  setRom(file: File, { persist = true } = {}): string | null {
    if (this.emu) return "End the current game first.";
    const found = gameForFile(file.name);
    if (!found) return `That file type isn't supported. Supported: ${ROM_ACCEPT.replaceAll(",", ", ")}.`;
    const { game, system } = found;
    if (persist) {
      this.resumeState = null;
      void saveResumeRom(file.name, file);
    }
    this.set({ rom: { file, game, system }, resuming: false });
    return null;
  }

  setHostName(name: string) {
    setName(name);
    this.set({ hostName: getName("Host") });
    this.publishPlayers(true);
  }

  /** The session's canvas, created on first use. Null during server render. */
  getCanvas() {
    if (!this.canvas && typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
    }
    return this.canvas;
  }

  /** Boots the ROM into the session canvas and starts streaming. No-op if already running. */
  async boot() {
    const rom = this.snapshot.rom;
    const canvas = this.getCanvas();
    if (!rom || !canvas || this.emu) return;
    const { core, size, config } = rom.system;
    canvas.width = size.width;
    canvas.height = size.height;
    pinCanvasSize(canvas, size.width, size.height);
    this.tap = installAudioTap();

    const { Nostalgist } = await import("nostalgist");
    this.emu = await Nostalgist.launch({
      core,
      rom: rom.file,
      element: canvas,
      size,
      ...selfHostedCores,
      // Resume where the last session stopped, if we have a state for this ROM.
      ...(this.resumeState ? { state: { fileName: "resume.state", fileContent: this.resumeState } } : {}),
      retroarchConfig: {
        video_smooth: false,
        // 1:1 PAR: the native picture fills the stream at an exact integer
        // scale (SNES 256x224 at 2x is 512x448). See docs/m1-spike-notes.md.
        aspect_ratio_index: 21,
        // No thumbnail work on each save; we only need the state.
        savestate_thumbnail_enable: false,
        // RetroArch's own wake lock request throws when the browser refuses it.
        // We hold one ourselves (keepAwake) and handle refusal.
        suspend_screensaver_enable: false,
        ...remoteBindingsConfig(),
        ...config,
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

    this.set({ running: true, resuming: false });
    this.broadcast({ t: "game", game: rom.game });
    for (const guest of this.guests.values()) void this.sendMedia(guest);
    this.timers.push(window.setInterval(() => void this.autosave(), AUTOSAVE_MS));
    document.addEventListener("visibilitychange", this.onHidden);
    this.keepAwake();
  }

  // No save on hide: a hidden tab stops RetroArch's frame loop, which is what
  // processes the save command. The 10 s autosave has run recently anyway.
  private onHidden = () => {
    // The browser drops wake locks when the tab is hidden; take it again on return.
    if (!document.hidden) this.keepAwake();
  };

  /** Keeps the host's screen on while a game runs. Best effort. */
  private keepAwake() {
    if (this.emu) navigator.wakeLock?.request("screen").catch(() => {});
  }

  // ---------- Save slots ----------

  async listSlots(): Promise<(SaveSlot | null)[]> {
    const rom = this.snapshot.rom;
    return rom ? listSaves(rom.file.name) : [];
  }

  async saveSlot(slot: number) {
    const emu = this.emu;
    const rom = this.snapshot.rom;
    if (!emu || !rom) return;
    const [{ state }, thumbnail] = await Promise.all([this.inTurn(() => emu.saveState()), this.thumbnail()]);
    await writeSave(rom.file.name, { slot, state, thumbnail, savedAt: Date.now() });
  }

  async loadSlot(slot: number) {
    const emu = this.emu;
    const rom = this.snapshot.rom;
    if (!emu || !rom) return;
    const save = (await listSaves(rom.file.name))[slot - 1];
    if (save) await this.inTurn(() => emu.loadState(save.state));
  }

  /** Runs a state operation after the ones already queued. */
  private inTurn<T>(op: () => Promise<T>): Promise<T> {
    const run = this.stateQueue.then(op, op);
    this.stateQueue = run.catch(() => {});
    return run;
  }

  /**
   * A small JPEG of the current frame, taken from the outgoing video track
   * (not RetroArch's screenshot), so saving adds no work to the emulator.
   */
  private async thumbnail(): Promise<Blob | null> {
    const track = this.stream?.getVideoTracks()[0];
    const Capture = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } })
      .ImageCapture;
    if (!track || !Capture) return null;
    try {
      // A paused game still yields its last frame; the timeout is a safety net.
      const frame = await Promise.race([
        new Capture(track).grabFrame(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no frame")), 800)),
      ]);
      const width = 192;
      const height = Math.round((frame.height / frame.width) * width);
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d")!.drawImage(frame, 0, 0, width, height);
      frame.close();
      return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    } catch {
      return null;
    }
  }

  pause() {
    this.emu?.pause();
  }
  resume() {
    this.emu?.resume();
  }

  /** Ends the session for everyone, on purpose: no grace period, no resume. */
  end() {
    this.broadcast({ t: "end" });
    for (const g of this.guests.values()) g.link.close();
    this.guests.clear();
    document.removeEventListener("visibilitychange", this.onHidden);
    this.emu?.exit({ removeCanvas: false });
    this.tap?.uninstall();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.timers.forEach(clearInterval);
    this.peer?.destroy();
    clearRoom();
    void clearResume();
    this.emu = this.tap = this.injector = this.stream = this.peer = null;
    this.canvas = null;
    this.resumeState = null;
    this.timers = [];
    this.peers = [];
    this.set({ status: "idle", code: null, players: [], spectators: 0, guests: [], rom: null, resuming: false, running: false });
  }

  // ---------- Player management ----------

  /** Moves a guest to a player slot (swapping with whoever has it) or to spectating (0). */
  setSlot(guestId: string, slot: number) {
    const guest = this.guests.get(guestId);
    if (!guest || guest.slot === slot) return;
    if (slot && !this.guestSlots().includes(slot)) return;
    const other = slot ? [...this.guests.values()].find((g) => g.slot === slot) : undefined;
    if (other) this.assign(other, guest.slot);
    this.assign(guest, slot);
    this.publishPlayers();
  }

  kick(guestId: string) {
    const guest = this.guests.get(guestId);
    if (!guest) return;
    guest.forget = true;
    this.reservations.ban(guest.token);
    guest.link.sendControl({ t: "kicked" });
    // Let the message flush before closing.
    setTimeout(() => guest.link.close(), 200);
  }

  private assign(guest: Guest, slot: number) {
    this.release(guest);
    guest.slot = slot;
    guest.hasSeq = false;
    guest.link.sendControl({ t: "slot", slot });
  }

  // ---------- Overlay ----------

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

  // ---------- Stats ----------

  /** Worst guest RTT and outbound video fps, for the host pill. */
  async sampleStats(): Promise<{ rttMs: number; fps: number | null; guests: number }> {
    let rttMs = 0;
    let fps: number | null = null;
    for (const g of this.guests.values()) {
      rttMs = Math.max(rttMs, g.link.rttMs);
      if (!g.hasMedia) continue;
      const stats = await g.link.pc.getStats();
      stats.forEach((s) => {
        if (s.type !== "outbound-rtp" || s.kind !== "video") return;
        if (fps === null && s.framesPerSecond) fps = s.framesPerSecond;
        // Each guest learns our encode time for their latency estimate.
        const encodeMs = perFrameMs(s.totalEncodeTime ?? 0, s.framesEncoded ?? 0, g.enc.time, g.enc.frames);
        g.enc = { time: s.totalEncodeTime ?? 0, frames: s.framesEncoded ?? 0 };
        if (encodeMs) g.link.sendControl({ t: "stats", encodeMs });
      });
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
        token: "",
        overlayId,
        name: "Guest",
        slot: 0,
        seq: 0,
        hasSeq: false,
        lastInputAt: 0,
        input: { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 },
        hasMedia: false,
        forget: false,
        enc: { time: 0, frames: 0 },
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

  /** Slots guests can take for the current game (none for 1-player systems). */
  guestSlots() {
    return remotePlayers(this.snapshot.rom?.system.players ?? 1);
  }

  private connectedSlots() {
    return new Set([...this.guests.values()].filter((g) => g.slot).map((g) => g.slot));
  }

  /** Connected players' slots plus slots held for dropped players. */
  private takenSlots() {
    const taken = this.reservations.heldSlots(performance.now());
    for (const slot of this.connectedSlots()) taken.add(slot);
    return taken;
  }

  private onControl(guest: Guest, msg: ControlMessage) {
    switch (msg.t) {
      case "hello": {
        if (this.reservations.isBanned(msg.token)) {
          guest.link.sendControl({ t: "kicked" });
          setTimeout(() => guest.link.close(), 200);
          return;
        }
        guest.token = msg.token;
        guest.name = msg.name.slice(0, MAX_NAME) || "Guest";
        guest.link.sendControl({
          t: "welcome",
          hostName: this.snapshot.hostName,
          game: this.snapshot.running ? (this.snapshot.rom?.game ?? null) : null,
          players: this.snapshot.players,
          spectators: this.snapshot.spectators,
        });
        // A reload can arrive before the old connection is noticed as gone:
        // the new one takes over its slot.
        let slot = 0;
        const old = [...this.guests.values()].find((g) => g !== guest && g.token === msg.token);
        if (old) {
          slot = old.slot;
          old.forget = true;
          this.release(old);
          this.guests.delete(old.id);
          old.link.close();
        }
        // A reconnect gets its old slot back.
        slot ||= this.reservations.claim(msg.token, performance.now(), this.connectedSlots());
        if (slot) this.assign(guest, slot);
        // Everyone gets the stream, players and spectators alike.
        if (this.stream) void this.sendMedia(guest);
        this.publishPlayers();
        break;
      }
      case "name":
        guest.name = msg.name.slice(0, MAX_NAME) || "Guest";
        this.publishPlayers(true);
        break;
      case "claim": {
        if (guest.slot) break;
        const taken = this.takenSlots();
        this.assign(guest, this.guestSlots().find((s) => !taken.has(s)) ?? 0);
        this.publishPlayers();
        break;
      }
      case "unclaim":
        this.assign(guest, 0);
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
    if (!guest.forget && guest.token) this.reservations.hold(guest.token, guest.slot, performance.now());
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

  /** Saves a resume state. Skipped while hidden (the emulator isn't advancing). */
  private async autosave() {
    const emu = this.emu;
    if (!emu || document.hidden) return;
    const t0 = performance.now();
    let state: Blob;
    try {
      ({ state } = await this.inTurn(() => emu.saveState()));
    } catch {
      return; // Next autosave will try again.
    }
    if (process.env.NODE_ENV === "development") {
      console.debug(`[gameroom] autosave ${(state.size / 1024) | 0} KB in ${(performance.now() - t0).toFixed(1)} ms`);
    }
    await saveResumeState(state);
  }

  private broadcast(msg: ControlMessage) {
    for (const g of this.guests.values()) g.link.sendControl(msg);
  }

  private publishPlayers(force = false) {
    const players: PlayerInfo[] = [{ slot: 1, name: this.snapshot.hostName, isHost: true }];
    const guests: GuestInfo[] = [];
    let spectators = 0;
    for (const g of this.guests.values()) {
      const rttMs = Math.round(g.link.rttMs);
      guests.push({ id: g.id, name: g.name, slot: g.slot, rttMs });
      if (g.slot) players.push({ slot: g.slot, name: g.name, rttMs });
      else spectators++;
    }
    players.sort((a, b) => a.slot - b.slot);
    this.publishPeers(force);
    const prev = this.snapshot;
    const same =
      !force &&
      prev.spectators === spectators &&
      prev.guests.length === guests.length &&
      prev.guests.every((g, i) => g.id === guests[i].id && g.slot === guests[i].slot && g.name === guests[i].name && g.rttMs === guests[i].rttMs) &&
      prev.players.length === players.length;
    if (same) return;
    this.set({ players, spectators, guests });
    this.broadcast({ t: "players", players, spectators });
  }

  private publishPeers(force: boolean) {
    const peers: OverlayPeer[] = [{ id: HOST_PEER, name: this.snapshot.hostName, slot: 1 }];
    for (const g of this.guests.values()) peers.push({ id: g.overlayId, name: g.name, slot: g.slot });
    const prev = this.peers;
    const same =
      prev.length === peers.length &&
      prev.every((p, i) => p.id === peers[i].id && p.name === peers[i].name && p.slot === peers[i].slot);
    if (same && !force) return;
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
