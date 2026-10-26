import { describe, expect, it } from "vitest";
import { iceReport } from "./ice-report";

describe("iceReport", () => {
  it("names each side's candidate kinds and counts failed pairs", () => {
    const stats = [
      { type: "local-candidate", candidateType: "host", address: "6a1f.local" },
      { type: "local-candidate", candidateType: "srflx", address: "203.0.113.7" },
      { type: "remote-candidate", candidateType: "host", address: "192.168.1.20" },
      { type: "candidate-pair", state: "failed" },
      { type: "candidate-pair", state: "waiting" },
    ];
    expect(iceReport(stats)).toBe(
      "This device: host (local name), srflx (public IP). Host: host (LAN IP). Pairs: 2 tried, 1 failed.",
    );
  });
});
