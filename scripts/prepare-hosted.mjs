import { cp, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobile } from "./build-mobile.mjs";

// Port the game into a separately initialized Vinext starter. No credentials,
// Site identity, dependencies or deployment are created by this command.
export async function prepareHosted(target) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(target);
  const pkg = JSON.parse(
    await readFile(resolve(output, "package.json"), "utf8"),
  );
  if (!pkg.devDependencies?.vinext || output === root)
    throw Error(
      "別ディレクトリで初期化したVinextスターターを指定してください。",
    );
  for (const file of ["package.json", "package-lock.json"])
    await copyFile(resolve(root, "hosted", file), resolve(output, file));
  await buildMobile(resolve(output, "public"), { cloud: true });
  await mkdir(resolve(output, "lib"), { recursive: true });
  await copyFile(
    resolve(root, "lib/hosted-ai.mjs"),
    resolve(output, "lib/hosted-ai.mjs"),
  );
  await cp(resolve(root, "hosted/app"), resolve(output, "app"), {
    recursive: true,
  });
  await cp(resolve(root, "hosted/db"), resolve(output, "db"), {
    recursive: true,
  });
  await cp(resolve(root, "hosted/drizzle"), resolve(output, "drizzle"), {
    recursive: true,
  });
  await copyFile(resolve(root, "hosted/raw.d.ts"), resolve(output, "raw.d.ts"));
  // Remove only the starter placeholder, after original game content is ported.
  await rm(resolve(output, "app/page.tsx"), { force: true });
  return { output };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw Error("使い方: node scripts/prepare-hosted.mjs Vinext出力先");
  console.log(JSON.stringify(await prepareHosted(process.argv[2])));
}
