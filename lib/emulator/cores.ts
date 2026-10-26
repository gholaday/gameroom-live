import build from "./core-build.json";

// Cores are self-hosted in public/cores/<version> (see scripts/fetch-cores.mjs).
// Which core runs which ROM is in systems.ts.

const coreUrl = (core: string, ext: "js" | "wasm") =>
  new URL(`/cores/${build.version}/${core}_libretro.${ext}`, window.location.href).href;

/** Spread into Nostalgist.launch options. */
export const selfHostedCores = {
  resolveCoreJs: (core: unknown) => coreUrl(String(core), "js"),
  resolveCoreWasm: (core: unknown) => coreUrl(String(core), "wasm"),
};
