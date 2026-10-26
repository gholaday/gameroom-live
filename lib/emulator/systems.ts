import type { RetroPadButton } from "@/lib/net/protocol";

// Everything that differs between systems. The stream, input protocol,
// overlay and reconnect logic are the same for all of them.

export type SystemId = "snes" | "nes" | "genesis" | "n64" | "gb" | "gba";

/** A face button as the console labels it, and the RetroPad button the core reads. */
export type PadButton = { button: RetroPadButton; label: string };

export type System = {
  id: SystemId;
  /** Shown in the UI. */
  name: string;
  core: string;
  extensions: readonly string[];
  /** Stream framebuffer: native resolution at an integer scale. */
  size: { width: number; height: number };
  /** Simultaneous players the core supports here. */
  players: number;
  /** Face buttons for the touch pad, left to right as on the console. */
  face: readonly PadButton[];
  shoulders: boolean;
  /** Extra retroarch.cfg entries. */
  config?: Record<string, string | number>;
};

export const SYSTEMS: Record<SystemId, System> = {
  snes: {
    id: "snes",
    name: "SNES",
    core: "snes9x",
    extensions: ["sfc", "smc"],
    size: { width: 512, height: 448 },
    players: 4,
    face: [
      { button: "y", label: "Y" },
      { button: "x", label: "X" },
      { button: "b", label: "B" },
      { button: "a", label: "A" },
    ],
    shoulders: true,
    // Multitap in port 2 gives players 2 to 4 (up to 5); 2-player games still see pad 2.
    config: { input_libretro_device_p2: 257 },
  },
  nes: {
    id: "nes",
    name: "NES",
    core: "fceumm",
    extensions: ["nes"],
    size: { width: 512, height: 480 },
    // fceumm turns the Four Score on for 4-player games it knows by checksum;
    // other games just ignore players 3 and 4.
    players: 4,
    face: [
      { button: "b", label: "B" },
      { button: "a", label: "A" },
    ],
    shoulders: false,
  },
  genesis: {
    id: "genesis",
    name: "Genesis",
    core: "genesis_plus_gx",
    extensions: ["md", "gen", "smd", "bin"],
    size: { width: 640, height: 448 },
    players: 2,
    // genesis_plus_gx: A, B, C are RetroPad Y, B, A.
    face: [
      { button: "y", label: "A" },
      { button: "b", label: "B" },
      { button: "a", label: "C" },
    ],
    shoulders: false,
  },
  n64: {
    id: "n64",
    name: "N64",
    core: "mupen64plus_next",
    extensions: ["z64", "n64", "v64"],
    size: { width: 640, height: 480 },
    players: 4,
    // mupen64plus_next: N64 A and B are RetroPad B and Y; Z is L2; the C
    // buttons are the right stick.
    face: [
      { button: "y", label: "B" },
      { button: "b", label: "A" },
    ],
    shoulders: true,
  },
  gb: {
    id: "gb",
    name: "Game Boy",
    core: "gambatte",
    extensions: ["gb", "gbc"],
    size: { width: 480, height: 432 },
    players: 1,
    face: [
      { button: "b", label: "B" },
      { button: "a", label: "A" },
    ],
    shoulders: false,
  },
  gba: {
    id: "gba",
    name: "Game Boy Advance",
    core: "mgba",
    extensions: ["gba"],
    size: { width: 720, height: 480 },
    players: 1,
    face: [
      { button: "b", label: "B" },
      { button: "a", label: "A" },
    ],
    shoulders: true,
  },
};

const BY_EXT = new Map(Object.values(SYSTEMS).flatMap((s) => s.extensions.map((e) => [e, s] as const)));

export function systemForFile(fileName: string): System | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT.get(ext) ?? null;
}

/** For `<input accept>`. */
export const ROM_ACCEPT = [...BY_EXT.keys()].map((e) => `.${e}`).join(",");
