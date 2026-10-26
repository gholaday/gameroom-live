"use client";

import { useEffect, useRef } from "react";
import {
  enterGameMode,
  focusDefault,
  onAnyGamepadButton,
  onNavAction,
  startNav,
  type NavAction,
} from "./manager";

/** Mount once in the root layout. */
export function NavRoot() {
  useEffect(() => {
    startNav();
  }, []);
  return null;
}

/** Register a handler for a controller action while the component is mounted. */
export function useNavAction(action: NavAction, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return onNavAction(action, () => ref.current());
  }, [action, enabled]);
}

/** While active, the UI ignores the controller except Start / Home / Escape. */
export function useGameMode(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return enterGameMode();
  }, [active]);
}

export function useAnyGamepadButton(handler: () => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return onAnyGamepadButton(() => ref.current());
  }, [enabled]);
}

/** Put focus on the [data-nav-default] element (or the first focusable) on mount. */
export function useInitialFocus(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    // Streamed Suspense content can mount a few hundred ms before React
    // reveals it, and hidden elements are not focusable. Retry briefly.
    let tries = 0;
    let id = 0;
    const attempt = () => {
      const el = document.activeElement;
      if (el && el !== document.body) return;
      focusDefault();
      if (document.activeElement === document.body && ++tries < 15) {
        id = window.setTimeout(attempt, 100);
      }
    };
    id = window.setTimeout(attempt, 0);
    return () => clearTimeout(id);
  }, [enabled]);
}
