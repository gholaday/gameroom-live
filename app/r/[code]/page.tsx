import { GuestRoute } from "@/components/guest-route";

// The room code is read on the client, so the whole join page prerenders as a
// static shell and paints before any JS runs.
export default function Page() {
  return <GuestRoute />;
}
