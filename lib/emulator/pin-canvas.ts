/**
 * RetroArch (1.22, Emscripten) sizes its framebuffer from a ResizeObserver on
 * the canvas, using devicePixelContentBoxSize. Pinned canvases report a fixed
 * size to every ResizeObserver instead, so CSS can scale the visible canvas
 * freely while the framebuffer, and so the encoded stream, stays at
 * native x integer scale regardless of layout or devicePixelRatio.
 */
const pinned = new WeakMap<Element, { width: number; height: number }>();
let installed = false;

export function pinCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  pinned.set(canvas, { width, height });
  if (installed) return;
  installed = true;

  const Native = window.ResizeObserver;
  class PinningResizeObserver extends Native {
    constructor(private readonly cb: ResizeObserverCallback) {
      super(cb);
    }
    observe(target: Element, options?: ResizeObserverOptions) {
      const size = pinned.get(target);
      if (!size) return super.observe(target, options);
      // Report the pinned size once, asynchronously like a real observer.
      const box = [{ inlineSize: size.width, blockSize: size.height }];
      const dpr = window.devicePixelRatio || 1;
      const entry = {
        target,
        contentRect: new DOMRectReadOnly(0, 0, size.width / dpr, size.height / dpr),
        borderBoxSize: box,
        contentBoxSize: box,
        devicePixelContentBoxSize: box,
      } as unknown as ResizeObserverEntry;
      queueMicrotask(() => this.cb([entry], this));
    }
  }
  window.ResizeObserver = PinningResizeObserver;
}
