// A one-line summary of a failed ICE attempt, short enough to show under the
// error on a phone, where there's no console to read.

type Candidate = { type: string; candidateType?: string; address?: string; protocol?: string };
type Pair = { type: string; state?: string };

/** What kind of address a candidate carries, in words. */
function kind(address = "") {
  if (!address) return "hidden";
  if (address.endsWith(".local")) return "local name";
  if (address.includes(":")) return "IPv6";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(address)) return "LAN IP";
  return "public IP";
}

function side(list: Candidate[]) {
  const seen = new Set(list.map((c) => `${c.candidateType ?? "?"} (${kind(c.address)})`));
  return seen.size ? [...seen].join(", ") : "nothing";
}

/** From `RTCPeerConnection.getStats()` values. */
export function iceReport(stats: Iterable<{ type: string }>) {
  const local: Candidate[] = [];
  const remote: Candidate[] = [];
  const pairs: Pair[] = [];
  for (const s of stats) {
    if (s.type === "local-candidate") local.push(s as Candidate);
    else if (s.type === "remote-candidate") remote.push(s as Candidate);
    else if (s.type === "candidate-pair") pairs.push(s as Pair);
  }
  const failed = pairs.filter((p) => p.state === "failed").length;
  return `This device: ${side(local)}. Host: ${side(remote)}. Pairs: ${pairs.length} tried, ${failed} failed.`;
}
