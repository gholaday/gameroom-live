import { describe, expect, it } from "vitest";
import { bit } from "@/lib/net/protocol";
import { dpadMask } from "./touch";

describe("dpadMask", () => {
  it("maps offsets to 8 directions with a center deadzone", () => {
    expect(dpadMask(0.1, 0.1)).toBe(0);
    expect(dpadMask(0.9, 0.1)).toBe(bit("right"));
    expect(dpadMask(0, -0.9)).toBe(bit("up"));
    expect(dpadMask(-0.6, 0.6)).toBe(bit("left") | bit("down"));
  });
});
