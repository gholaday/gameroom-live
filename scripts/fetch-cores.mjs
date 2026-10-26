// Downloads libretro cores (RetroArch Emscripten builds, the same ones
// Nostalgist uses) into public/cores so they're served same-origin. That keeps
// COEP happy and removes the runtime dependency on jsDelivr and zip.js.
//
// Runs before `dev` and `build`. Skips cores that are already present.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

// Shared with the app (lib/emulator/cores.ts). The version must match what
// Nostalgist expects (coreVersion in nostalgist.js). Files land in a versioned
// folder so they can be cached forever.
const build = JSON.parse(await readFile(path.join(process.cwd(), "lib/emulator/core-build.json"), "utf8"));
const BUILD = `${build.repo}@${build.version}`;
const CORES = build.cores;
const OUT = path.join(process.cwd(), "public", "cores", build.version);

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(OUT, { recursive: true });

for (const core of CORES) {
  const js = path.join(OUT, `${core}_libretro.js`);
  const wasm = path.join(OUT, `${core}_libretro.wasm`);
  if ((await exists(js)) && (await exists(wasm))) continue;

  // Cores missing from that build (N64) come from the same author's custom
  // builds against the same RetroArch version.
  const source = build.sources?.[core];
  const url = source
    ? `https://cdn.jsdelivr.net/${source}/${core}_libretro.zip`
    : `https://cdn.jsdelivr.net/gh/${BUILD}/retroarch/${core}_libretro.zip`;
  console.log(`fetch-cores: downloading ${core}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch-cores: ${url} returned ${res.status}`);

  const reader = new ZipReader(new BlobReader(await res.blob()));
  for (const entry of await reader.getEntries()) {
    const name = path.basename(entry.filename);
    if (entry.directory || !/\.(js|wasm)$/.test(name)) continue;
    const blob = await entry.getData(new BlobWriter());
    await writeFile(path.join(OUT, name), Buffer.from(await blob.arrayBuffer()));
  }
  await reader.close();

  if (!(await exists(js)) || !(await exists(wasm))) {
    throw new Error(`fetch-cores: ${core} zip did not contain ${core}_libretro.js and .wasm`);
  }
}
