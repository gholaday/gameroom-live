import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, DEFAULT_PAD } from "@/lib/input/mapping";
import { hostInputConfig, retroarchKey } from "./host-input";

describe("retroarchKey", () => {
  it("names letters, digits, arrows and punctuation the RetroArch way", () => {
    expect(retroarchKey("KeyX")).toBe("x");
    expect(retroarchKey("Digit3")).toBe("num3");
    expect(retroarchKey("ShiftRight")).toBe("rshift");
    expect(retroarchKey("MediaPlayPause")).toBeNull();
  });
});

describe("hostInputConfig", () => {
  it("writes player 1 keys and pad buttons, and drops reserved keys", () => {
    const config = hostInputConfig({ ...DEFAULT_KEYS, a: "KeyT" }, DEFAULT_PAD);
    expect(config.input_player1_b).toBe("z");
    expect(config.input_player1_b_btn).toBe("0");
    // T is player 2's up.
    expect(config.input_player1_a).toBe("nul");
  });
});
