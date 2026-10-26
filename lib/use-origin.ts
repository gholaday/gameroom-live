"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The current host (no protocol), or a fallback during server render. */
export function useHost(fallback = "") {
  return useSyncExternalStore(
    subscribe,
    () => window.location.host,
    () => fallback,
  );
}
