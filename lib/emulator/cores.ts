import build from "./core-build.json";

// Cores are self-hosted in public/cores/<version> (see scripts/fetch-cores.mjs).

export type CoreName = "snes9x";

const CORE_BY_EXT: Record<string, CoreName> = {
  sfc: "snes9x",
  smc: "snes9x",
};

export function coreForFile(fileName: string): CoreName | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return CORE_BY_EXT[ext] ?? null;
}

const coreUrl = (core: string, ext: "js" | "wasm") =>
  new URL(`/cores/${build.version}/${core}_libretro.${ext}`, window.location.href).href;

/** Spread into Nostalgist.launch options. */
export const selfHostedCores = {
  resolveCoreJs: (core: unknown) => coreUrl(String(core), "js"),
  resolveCoreWasm: (core: unknown) => coreUrl(String(core), "wasm"),
};
