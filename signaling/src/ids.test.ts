import { describe, expect, it } from "vitest";
import { originAllowed, roomForPeerId } from "./ids";

describe("roomForPeerId", () => {
  it("reads the room from host and guest ids and rejects others", () => {
    expect(roomForPeerId("gameroom-live-WRSC")).toBe("WRSC");
    expect(roomForPeerId("gameroom-live-WRSC-3f9a0c1d2e")).toBe("WRSC");
    expect(roomForPeerId("gameroom-live-wrsc")).toBeNull();
    expect(roomForPeerId("someone-else")).toBeNull();
  });
});

describe("originAllowed", () => {
  it("matches exact origins only", () => {
    const list = "https://gameroom.live, http://localhost:3000";
    expect(originAllowed("http://localhost:3000", list)).toBe(true);
    expect(originAllowed("https://gameroom.live.evil.com", list)).toBe(false);
    expect(originAllowed(null, list)).toBe(false);
  });
});
