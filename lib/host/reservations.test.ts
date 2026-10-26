import { describe, expect, it } from "vitest";
import { SlotReservations } from "./reservations";

describe("SlotReservations", () => {
  it("gives a reconnecting guest their slot back within the hold window, once", () => {
    const r = new SlotReservations(60_000);
    r.hold("t1", 2, 0);
    expect(r.heldSlots(1000)).toEqual(new Set([2]));
    expect(r.claim("t1", 59_000, new Set())).toBe(2);
    expect(r.claim("t1", 59_001, new Set())).toBe(0);
  });

  it("drops expired holds and slots someone else took", () => {
    const r = new SlotReservations(60_000);
    r.hold("late", 2, 0);
    r.hold("bumped", 3, 0);
    expect(r.claim("late", 60_001, new Set())).toBe(0);
    expect(r.claim("bumped", 10, new Set([3]))).toBe(0);
  });

  it("never holds for a kicked guest", () => {
    const r = new SlotReservations(60_000);
    r.hold("k", 2, 0);
    r.ban("k");
    r.hold("k", 2, 1);
    expect(r.isBanned("k")).toBe(true);
    expect(r.claim("k", 2, new Set())).toBe(0);
  });
});
