// Downloads libretro cores (RetroArch Emscripten builds, the same ones
// Nostalgist uses) into public/cores so they're served same-origin. That keeps
// COEP happy and removes the runtime dependency on jsDelivr and zip.js.
//
// Runs before `dev` and `build`. Skips cores that are already present.

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

// Must match the version Nostalgist expects (see coreVersion in nostalgist.js).
const BUILD = "arianrhodsandlot/retroarch-emscripten-build@v1.22.2";
const CORES = ["snes9x"];
const OUT = path.join(process.cwd(), "public", "cores");

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(OUT, { recursive: true });

for (const core of CORES) {
  const js = path.join(OUT, `${core}_libretro.js`);
  const wasm = path.join(OUT, `${core}_libretro.wasm`);
  if ((await exists(js)) && (await exists(wasm))) continue;

  const url = `https://cdn.jsdelivr.net/gh/${BUILD}/retroarch/${core}_libretro.zip`;
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
