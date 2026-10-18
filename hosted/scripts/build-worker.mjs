import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { build } from "esbuild";
// The supported Sites Worker ESM artifact: one self-contained module plus
// the original hosting identity and unchanged D1 migration metadata.
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const result = await build({
  entryPoints: ["worker/index.js"], outfile: "dist/server/index.js",
  bundle: true, format: "esm", platform: "browser", target: "es2022", metafile: true,
});
if (result.metafile.outputs["dist/server/index.js"].imports.length)
  throw Error("The Worker must be self-contained, with no external runtime imports");
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (manifest.static || manifest.d1 !== "DB") throw Error("Expected a Sites Worker with the existing DB binding");
console.log("Built a self-contained Sites Worker; no framework runtime or standalone assets.");
