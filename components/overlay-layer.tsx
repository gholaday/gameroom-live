"use client";

import { useEffect, useRef, type RefObject } from "react";
import { OverlayController, type OverlaySink } from "@/lib/overlay/controller";

/**
 * Hands and ink over the game frame. Sits exactly on the frame's box so
 * normalized coordinates line up for every viewer. Mounts the controller once;
 * all per-frame work happens inside it, not in React.
 */
export function OverlayLayer({
  frameRef,
  attach,
  sink,
}: {
  frameRef: RefObject<HTMLElement | null>;
  attach: (overlay: OverlayController) => () => void;
  sink: OverlaySink;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    const container = root?.parentElement;
    if (!root || !frame || !container) return;

    // Match the frame's box. Observe the container: the frame itself may be a
    // pinned emulator canvas whose ResizeObserver reports a fixed size.
    const place = () => {
      const f = contentRect(frame);
      const c = container.getBoundingClientRect();
      root.style.left = `${f.left - c.left}px`;
      root.style.top = `${f.top - c.top}px`;
      root.style.width = `${f.width}px`;
      root.style.height = `${f.height}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(container);
    window.addEventListener("resize", place);
    // A video only knows its picture size once metadata arrives.
    frame.addEventListener("resize", place);

    const overlay = new OverlayController(root, sink);
    const detach = attach(overlay);
    return () => {
      detach();
      overlay.destroy();
      ro.disconnect();
      window.removeEventListener("resize", place);
      frame.removeEventListener("resize", place);
    };
    // attach and sink are stable session methods; mount once.
  }, [frameRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} aria-hidden className="absolute z-[5] cursor-crosshair overflow-hidden" />;
}

/** The picture's box inside an object-fit: contain element. */
function contentRect(el: HTMLElement) {
  const box = el.getBoundingClientRect();
  const iw = el instanceof HTMLVideoElement ? el.videoWidth : el instanceof HTMLCanvasElement ? el.width : 0;
  const ih = el instanceof HTMLVideoElement ? el.videoHeight : el instanceof HTMLCanvasElement ? el.height : 0;
  if (!iw || !ih) return box;
  const scale = Math.min(box.width / iw, box.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}
