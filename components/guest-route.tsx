"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { GuestJoin } from "@/components/guest-join";
import { readRoom } from "@/lib/host/room-tab";

// Only the host's own tab needs the play screen; guests never load it.
const HostPlay = dynamic(() => import("@/components/host-play").then((m) => m.HostPlay), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-game-bg" />,
});

const subscribe = () => () => {};
const codeFromPath = () => window.location.pathname.split("/")[2]?.toUpperCase() ?? "";
const hostsThisRoom = () => {
  const code = codeFromPath();
  return !!code && readRoom() === code;
};

/**
 * Reads the room code from the URL on the client. Next's params need a
 * Suspense boundary under Cache Components, which delays the whole page until
 * React reveals it; this way the join page is a static shell that paints at once.
 * The tab hosting this room gets its game here instead of the join page.
 */
export function GuestRoute() {
  const code = useSyncExternalStore(subscribe, codeFromPath, () => "");
  const hosting = useSyncExternalStore(subscribe, hostsThisRoom, () => false);
  if (!code) return <div className="min-h-screen" />;
  if (hosting) return <HostPlay />;
  return <GuestJoin key={code} code={code} />;
}
