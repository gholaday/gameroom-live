import { describe, expect, it } from "vitest";
import { bit } from "@/lib/net/protocol";
import { bind, DEFAULT_KEYS, DEFAULT_PAD, keyMasks } from "./mapping";

describe("bind", () => {
  it("swaps with the button that already had the input", () => {
    const next = bind(DEFAULT_PAD, "a", 0);
    expect(next.a).toBe(0);
    expect(next.b).toBe(1);
  });

  it("leaves other bindings alone for a free input", () => {
    const next = bind(DEFAULT_KEYS, "l2", "KeyE");
    expect(next.l2).toBe("KeyE");
    expect(next.a).toBe("KeyX");
  });
});

describe("keyMasks", () => {
  it("maps codes to masks and skips unbound buttons", () => {
    const masks = keyMasks(bind(DEFAULT_KEYS, "a", "Space"));
    expect(masks.get("Space")).toBe(bit("a"));
    expect(masks.has("")).toBe(false);
  });
});
