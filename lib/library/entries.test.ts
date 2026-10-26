import { describe, expect, it } from "vitest";
import { gameTitle, mergeEntries } from "./entries";

describe("gameTitle", () => {
  it("drops the extension and tags, and puts a trailing article back in front", () => {
    expect(gameTitle("Super Mario World (USA) [!].sfc")).toBe("Super Mario World");
    expect(gameTitle("Legend of Zelda, The - A Link to the Past (USA).sfc")).toBe("The Legend of Zelda - A Link to the Past");
  });
});

describe("mergeEntries", () => {
  it("keeps only ROMs, one per file name, and sorts by title", () => {
    const first = mergeEntries([], [
      { path: "Zelda.sfc", kind: "copy" },
      { path: "snes/readme.txt", kind: "dir" },
    ]);
    const merged = mergeEntries(first, [
      { path: "snes/Zelda.sfc", kind: "dir" },
      { path: "F-Zero.smc", kind: "copy" },
    ]);
    expect(merged.map((e) => [e.path, e.kind])).toEqual([
      ["F-Zero.smc", "copy"],
      ["snes/Zelda.sfc", "dir"],
    ]);
  });
});
