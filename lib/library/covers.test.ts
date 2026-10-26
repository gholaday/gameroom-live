import { describe, expect, it } from "vitest";
import { coverUrl } from "./covers";

describe("coverUrl", () => {
  it("uses the system's repo and libretro's character substitutions", () => {
    expect(coverUrl("Mario & Luigi: Superstar Saga (USA).gba", "gba")).toBe(
      "https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Game_Boy_Advance/master/Named_Boxarts/Mario%20_%20Luigi_%20Superstar%20Saga%20(USA).png",
    );
    expect(coverUrl("Pokemon - Crystal Version (USA).gbc", "gb")).toContain("/Nintendo_-_Game_Boy_Color/");
  });
});
