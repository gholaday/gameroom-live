"use client";

import { useSyncExternalStore } from "react";
import { GuestJoin } from "@/components/guest-join";

const subscribe = () => () => {};
const codeFromPath = () => window.location.pathname.split("/")[2]?.toUpperCase() ?? "";

/**
 * Reads the room code from the URL on the client. Next's params need a
 * Suspense boundary under Cache Components, which delays the whole page until
 * React reveals it; this way the join page is a static shell that paints at once.
 */
export function GuestRoute() {
  const code = useSyncExternalStore(subscribe, codeFromPath, () => "");
  if (!code) return <div className="min-h-screen" />;
  return <GuestJoin key={code} code={code} />;
}
