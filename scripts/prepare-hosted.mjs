import { cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobile } from "./build-mobile.mjs";

// Prepare a separate Sites Worker ESM checkout; never copy local credentials,
// Site identity or runtime state. An existing hosting manifest is preserved.
export async function prepareHosted(target) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(target);
  if (output === root || output.startsWith(root + sep) || output === dirname(output))
    throw Error("別ディレクトリのSites Worker出力先を指定してください。");
  await mkdir(output, { recursive: true });
  for (const file of ["package.json", "package-lock.json", "tsconfig.json"])
    await copyFile(resolve(root, "hosted", file), resolve(output, file));
  const { files } = await buildMobile(resolve(output, "public"));
  const assets = Object.fromEntries(await Promise.all(files.map(async (file) =>
    [file, await readFile(resolve(output, "public", file), "utf8")])));
  await writeFile(resolve(output, "assets.mjs"), `export default ${JSON.stringify(assets)};\n`);
  await mkdir(resolve(output, "lib"), { recursive: true });
  for (const file of ["hosted-ai.mjs", "hosted-worker.mjs"])
    await copyFile(resolve(root, "lib", file), resolve(output, "lib", file));
  for (const directory of ["worker", "scripts", "db", "drizzle"])
    await cp(resolve(root, "hosted", directory), resolve(output, directory), { recursive: true });
  await writeFile(resolve(output, "wrangler.json"), JSON.stringify({
    name: "unwritten-life-local-verification", main: "dist/server/index.js",
    compatibility_date: "2026-10-17",
    d1_databases: [{ binding: "DB", database_name: "verification-only", database_id: "00000000-0000-4000-8000-000000000000" }],
  }, null, 2) + "\n");
  return { output };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw Error("使い方: node scripts/prepare-hosted.mjs Sites出力先");
  console.log(JSON.stringify(await prepareHosted(process.argv[2])));
}
