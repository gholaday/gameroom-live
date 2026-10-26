import type { DataConnection } from "peerjs";
import { encodePing, INPUT_BYTES, PING, PING_BYTES, PONG, type ControlMessage } from "./protocol";

// One RTCPeerConnection per guest. PeerJS sets it up and gives us a reliable
// JSON control channel. Everything latency sensitive is ours on the same
// connection:
// - a pre-negotiated input channel (unordered, no retransmits). Negotiated
//   channels never fire `datachannel`, so PeerJS can't grab it.
// - media tracks, added by the host and renegotiated over the control channel.
// - overlay channels: cursors (unordered, no retransmits) and ink (reliable).

const INPUT_CHANNEL_ID = 100;
const CURSOR_CHANNEL_ID = 101;
const INK_CHANNEL_ID = 102;
const PING_INTERVAL_MS = 500;

export type LinkHandlers = {
  onControl: (msg: ControlMessage) => void;
  onInput?: (packet: DataView) => void;
  onCursor?: (packet: ArrayBuffer) => void;
  onInk?: (packet: ArrayBuffer) => void;
  onClose: () => void;
};

export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly input: RTCDataChannel;
  readonly cursor: RTCDataChannel;
  readonly ink: RTCDataChannel;
  /** Smoothed round trip time over the input channel, in ms. 0 until measured. */
  rttMs = 0;
  private readonly pingView = new DataView(new ArrayBuffer(PING_BYTES));
  private pingTimer = 0;
  private closed = false;

  constructor(
    readonly conn: DataConnection,
    private readonly handlers: LinkHandlers,
  ) {
    const pc = conn.peerConnection;
    if (!pc) throw new Error("PeerJS connection has no RTCPeerConnection yet");
    this.pc = pc;

    this.input = pc.createDataChannel("input", {
      negotiated: true,
      id: INPUT_CHANNEL_ID,
      ordered: false,
      maxRetransmits: 0,
    });
    this.input.binaryType = "arraybuffer";
    this.input.onmessage = (e) => this.onInputMessage(e.data as ArrayBuffer);
    this.input.onopen = () => {
      this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
    };

    this.cursor = pc.createDataChannel("cursor", {
      negotiated: true,
      id: CURSOR_CHANNEL_ID,
      ordered: false,
      maxRetransmits: 0,
    });
    this.cursor.binaryType = "arraybuffer";
    this.cursor.onmessage = (e) => this.handlers.onCursor?.(e.data as ArrayBuffer);
    this.ink = pc.createDataChannel("ink", { negotiated: true, id: INK_CHANNEL_ID });
    this.ink.binaryType = "arraybuffer";
    this.ink.onmessage = (e) => this.handlers.onInk?.(e.data as ArrayBuffer);

    conn.on("data", (data) => this.onControlMessage(data as ControlMessage));
    conn.on("close", () => this.close());
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.close();
    });
  }

  sendControl(msg: ControlMessage) {
    if (this.conn.open) this.conn.send(msg);
  }

  /** Hot path: one send, no allocation. Drops silently until the channel opens. */
  sendInput(packet: DataView<ArrayBuffer>) {
    if (this.input.readyState === "open") this.input.send(packet);
  }

  sendCursor(packet: ArrayBuffer | DataView<ArrayBuffer>) {
    if (this.cursor.readyState !== "open") return;
    if (packet instanceof ArrayBuffer) this.cursor.send(packet);
    else this.cursor.send(packet);
  }

  sendInk(packet: ArrayBuffer) {
    if (this.ink.readyState === "open") this.ink.send(packet);
  }

  /** Host side: re-offer after adding tracks. Only the host renegotiates, so no glare. */
  async renegotiate() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendControl({ t: "offer", sdp: offer.sdp ?? "" });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    this.conn.close();
    this.pc.close();
    this.handlers.onClose();
  }

  private async onControlMessage(msg: ControlMessage) {
    if (msg.t === "offer") {
      await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sendControl({ t: "answer", sdp: answer.sdp ?? "" });
      return;
    }
    if (msg.t === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      return;
    }
    this.handlers.onControl(msg);
  }

  private onInputMessage(buf: ArrayBuffer) {
    if (buf.byteLength === INPUT_BYTES) {
      this.handlers.onInput?.(new DataView(buf));
      return;
    }
    if (buf.byteLength !== PING_BYTES) return;
    const view = new DataView(buf);
    const kind = view.getUint8(0);
    const time = view.getFloat64(1);
    if (kind === PING) {
      // Echo the sender's own timestamp; clocks never need to agree.
      view.setUint8(0, PONG);
      this.input.send(view);
    } else if (kind === PONG) {
      const sample = performance.now() - time;
      this.rttMs = this.rttMs === 0 ? sample : this.rttMs * 0.7 + sample * 0.3;
    }
  }

  private ping() {
    if (this.input.readyState !== "open") return;
    encodePing(PING, performance.now(), this.pingView);
    this.input.send(this.pingView);
  }
}

/**
 * STUN only, no TURN relay (a deliberate choice for a friends-only app):
 * players behind strict NAT won't connect. A constant, so connecting
 * doesn't wait on an API round trip first.
 */
export const ICE_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };
