import { describe, expect, it } from "vitest";
import build from "./core-build.json";
import { SYSTEMS, systemForFile } from "./systems";

describe("systems", () => {
  it("downloads every core a system uses", () => {
    for (const s of Object.values(SYSTEMS)) expect(build.cores).toContain(s.core);
  });

  it("picks the system by extension, case-insensitively", () => {
    expect(systemForFile("Sonic (USA).MD")?.id).toBe("genesis");
    expect(systemForFile("Tetris (World).gb")?.id).toBe("gb");
    expect(systemForFile("notes.txt")).toBeNull();
  });
});
