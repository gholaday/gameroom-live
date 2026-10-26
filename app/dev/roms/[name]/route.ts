import { readFile } from "node:fs/promises";
import path from "node:path";

// Dev only: serves test ROMs from the git-ignored /roms folder so the spike
// can boot one with /spike?rom=<file name>. Never available in production.
export async function GET(_req: Request, ctx: RouteContext<"/dev/roms/[name]">) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const { name } = await ctx.params;
  const dir = path.join(process.cwd(), "roms");
  const file = path.join(dir, path.basename(name));
  try {
    return new Response(await readFile(file), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
