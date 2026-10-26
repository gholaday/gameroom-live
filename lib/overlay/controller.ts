import {
  CURSOR_BYTES,
  CURSOR_PRESSED,
  CURSOR_VISIBLE,
  decodeCursor,
  decodeInk,
  encodeCursor,
  encodeInk,
  INK_MAX_POINTS,
  type Cursor,
} from "@/lib/net/overlay";
import type { OverlayPeer } from "@/lib/net/protocol";

// Pointer hands and fading ink over the game, for everyone in the room.
// Plain DOM and canvas, outside React: hands are absolutely positioned nodes
// moved with transform, ink is one 2D canvas, and the rAF loop only runs while
// something is moving or fading. Sends ride the same loop, so cursors go out at
// most once per frame no matter how fast the pointer events come.

export type OverlaySink = {
  cursor: (packet: DataView<ArrayBuffer>) => void;
  ink: (packet: ArrayBuffer) => void;
};

const INK_LIFE_MS = 4000;
const INK_FADE_MS = 1000;
const CURSOR_IDLE_MS = 3000;
const CURSOR_SEND_MS = 33;
const SLOT_COLORS = ["", "#E5603F", "#1F9E89", "#7A5AF0", "#E0A21B"];
const SPECTATOR_COLORS = ["#2D7FF0", "#C2459E", "#14A3C7", "#6BA31F", "#F07B2D", "#E5483B", "#5C5C63"];

export function peerColor(peer: OverlayPeer | undefined, id: number) {
  if (peer?.slot) return SLOT_COLORS[peer.slot];
  return SPECTATOR_COLORS[id % SPECTATOR_COLORS.length];
}

type Hand = {
  el: HTMLElement;
  x: number;
  y: number;
  tx: number;
  ty: number;
  flags: number;
  seen: number;
  /** Shows the pencil instead of the hand, while that person is drawing. */
  pencil: boolean;
};
type Stroke = { color: string; pts: number[]; last: number };

const PENCIL_PATH =
  "M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z";
const PENCIL_SVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" style="display:none"><path d="${PENCIL_PATH}"/></svg>`;
/** Your own pointer while you draw. The hotspot is the pencil tip. */
const PENCIL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#2B2B2E" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="${PENCIL_PATH}"/></svg>`,
)}") 2 22, crosshair`;
/** Where the point is inside each glyph's box: the fingertip, or the pencil tip. */
const HAND_TIP = [9, 2] as const;
const PENCIL_TIP = [3, 25] as const;

const HAND_SVG =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V5a1.5 1.5 0 0 1 3 0v8.5c0 4-2.5 7.5-7 7.5-3 0-4.5-1.5-6-4l-2.6-4.4a1.6 1.6 0 0 1 2.6-1.8L9 13z"/></svg>';

export class OverlayController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hands = new Map<number, Hand>();
  private readonly strokes = new Map<number, Stroke>();
  private peers = new Map<number, OverlayPeer>();
  private selfId = 0;
  private raf = 0;
  private dpr = 1;

  // Local pointer state.
  private readonly local: Cursor = { peer: 0, x: 0, y: 0, flags: 0 };
  private readonly cursorView = new DataView(new ArrayBuffer(CURSOR_BYTES));
  private cursorDirty = false;
  private lastCursorSent = 0;
  private strokeId = 0;
  private drawing = false;
  private readonly pending: number[] = [];
  private readonly ro: ResizeObserver;

  constructor(
    private readonly root: HTMLElement,
    private readonly sink: OverlaySink,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    root.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    root.style.touchAction = "none";

    root.addEventListener("pointermove", this.onMove);
    root.addEventListener("pointerdown", this.onDown);
    root.addEventListener("pointerup", this.onUp);
    root.addEventListener("pointercancel", this.onUp);
    root.addEventListener("pointerleave", this.onLeave);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
  }

  /** `selfId` is this viewer's own peer id, so its stroke color matches what others see. */
  setPeers(peers: OverlayPeer[], selfId: number) {
    this.peers = new Map(peers.map((p) => [p.id, p]));
    this.selfId = selfId;
    for (const [id, hand] of this.hands) {
      if (!this.peers.has(id)) {
        hand.el.remove();
        this.hands.delete(id);
      } else this.styleHand(hand, id);
    }
  }

  remoteCursor(buf: ArrayBuffer) {
    const c: Cursor = { peer: 0, x: 0, y: 0, flags: 0 };
    decodeCursor(new DataView(buf), c);
    let hand = this.hands.get(c.peer);
    if (!hand) {
      hand = this.createHand(c.peer, c.x, c.y);
      this.hands.set(c.peer, hand);
    }
    hand.tx = c.x;
    hand.ty = c.y;
    hand.flags = c.flags;
    hand.seen = performance.now();
    const pencil = !!(c.flags & CURSOR_PRESSED);
    if (pencil !== hand.pencil) {
      hand.pencil = pencil;
      (hand.el.children[0] as HTMLElement).style.display = pencil ? "none" : "";
      (hand.el.children[1] as HTMLElement).style.display = pencil ? "" : "none";
    }
    this.wake();
  }

  remoteInk(buf: ArrayBuffer) {
    const { peer, stroke, points } = decodeInk(new DataView(buf));
    this.addInk((peer << 16) | stroke, peerColor(this.peers.get(peer), peer), points, points.length / 2);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointerup", this.onUp);
    this.root.removeEventListener("pointercancel", this.onUp);
    this.root.removeEventListener("pointerleave", this.onLeave);
    this.root.replaceChildren();
  }

  // ---------- Local pointer ----------

  private toLocal(e: PointerEvent, into: number[] | null) {
    const r = this.root.getBoundingClientRect();
    // Coalesced events give every sample since the last frame: smoother ink.
    const events = into && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const x = (ev.clientX - r.left) / r.width;
      const y = (ev.clientY - r.top) / r.height;
      this.local.x = x;
      this.local.y = y;
      into?.push(x, y);
    }
  }

  private onMove = (e: PointerEvent) => {
    this.toLocal(e, this.drawing ? this.pending : null);
    this.local.flags = CURSOR_VISIBLE | (this.drawing ? CURSOR_PRESSED : 0);
    this.cursorDirty = true;
    this.wake();
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.root.setPointerCapture(e.pointerId);
    this.drawing = true;
    this.strokeId = (this.strokeId + 1) & 0xffff;
    this.pending.length = 0;
    this.toLocal(e, this.pending);
    this.local.flags = CURSOR_VISIBLE | CURSOR_PRESSED;
    this.cursorDirty = true;
    this.root.style.cursor = PENCIL_CURSOR;
    this.wake();
  };

  private onUp = () => {
    if (!this.drawing) return;
    this.flushInk();
    this.drawing = false;
    this.root.style.cursor = "";
    this.local.flags = CURSOR_VISIBLE;
    this.cursorDirty = true;
    this.wake();
  };

  private onLeave = () => {
    if (this.drawing) return;
    this.local.flags = 0;
    this.cursorDirty = true;
    this.wake();
  };

  private flushInk() {
    const n = this.pending.length / 2;
    if (!n) return;
    const key = (this.selfId << 16) | this.strokeId;
    this.addInk(key, peerColor(this.peers.get(this.selfId), this.selfId), this.pending, n);
    for (let i = 0; i < n; i += INK_MAX_POINTS) {
      const count = Math.min(INK_MAX_POINTS, n - i);
      this.sink.ink(encodeInk(0, this.strokeId, this.pending.slice(i * 2, (i + count) * 2), count));
    }
    // Keep the last point so the next batch joins up with this one.
    const lx = this.pending[this.pending.length - 2];
    const ly = this.pending[this.pending.length - 1];
    this.pending.length = 0;
    this.pending.push(lx, ly);
  }

  // ---------- Model ----------

  private addInk(key: number, color: string, points: ArrayLike<number>, count: number) {
    let stroke = this.strokes.get(key);
    if (!stroke) {
      stroke = { color, pts: [], last: 0 };
      this.strokes.set(key, stroke);
    }
    for (let i = 0; i < count * 2; i++) stroke.pts.push(points[i]);
    stroke.last = performance.now();
    this.wake();
  }

  private createHand(id: number, x: number, y: number): Hand {
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:none;will-change:transform;display:flex;align-items:flex-start;gap:2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
    el.innerHTML = `${HAND_SVG}${PENCIL_SVG}<span style="margin-top:22px;padding:2px 8px;border-radius:999px;color:#fff;font:800 12px var(--font-nunito),system-ui;white-space:nowrap"></span>`;
    this.root.append(el);
    const hand = { el, x, y, tx: x, ty: y, flags: 0, seen: 0, pencil: false };
    this.styleHand(hand, id);
    return hand;
  }

  private styleHand(hand: Hand, id: number) {
    const peer = this.peers.get(id);
    const color = peerColor(peer, id);
    hand.el.style.color = color;
    const label = hand.el.lastElementChild as HTMLElement;
    label.style.background = color;
    label.textContent = peer?.name ?? "Guest";
  }

  // ---------- Frame loop ----------

  private wake() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private resize() {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.root.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.wake();
  }

  private tick = (now: number) => {
    this.raf = 0;
    let alive = false;

    // Sends: at most one cursor packet per CURSOR_SEND_MS, ink every frame while drawing.
    if (this.drawing && this.pending.length > 2) this.flushInk();
    if (this.cursorDirty && now - this.lastCursorSent >= CURSOR_SEND_MS) {
      encodeCursor(this.local, this.cursorView);
      this.sink.cursor(this.cursorView);
      this.cursorDirty = false;
      this.lastCursorSent = now;
    }
    if (this.cursorDirty || this.drawing) alive = true;

    // Hands: ease toward the latest position; hide when idle or hidden.
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    for (const hand of this.hands.values()) {
      const visible = hand.flags & CURSOR_VISIBLE && now - hand.seen < CURSOR_IDLE_MS;
      hand.x += (hand.tx - hand.x) * 0.45;
      hand.y += (hand.ty - hand.y) * 0.45;
      // The fingertip or pencil tip, not the box corner, marks the point.
      const [ox, oy] = hand.pencil ? PENCIL_TIP : HAND_TIP;
      hand.el.style.transform = `translate3d(${hand.x * w - ox}px, ${hand.y * h - oy}px, 0)`;
      hand.el.style.opacity = visible ? "1" : "0";
      if (visible && (Math.abs(hand.tx - hand.x) > 0.0005 || Math.abs(hand.ty - hand.y) > 0.0005)) alive = true;
      if (visible) alive ||= now - hand.seen < CURSOR_IDLE_MS;
    }

    // Ink: redraw everything with age-based fade; drop expired strokes.
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4 * this.dpr;
    for (const [key, s] of this.strokes) {
      const age = now - s.last;
      if (age > INK_LIFE_MS) {
        this.strokes.delete(key);
        continue;
      }
      alive = true;
      ctx.globalAlpha = age < INK_LIFE_MS - INK_FADE_MS ? 1 : (INK_LIFE_MS - age) / INK_FADE_MS;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.pts[0] * cw, s.pts[1] * ch);
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * cw + 0.1, s.pts[1] * ch);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * cw, s.pts[i + 1] * ch);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (alive) this.wake();
  };
}
