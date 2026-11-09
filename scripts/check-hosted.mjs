import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { prepareHosted } from "./prepare-hosted.mjs";

// Build only synthetic, credential-free state. Never read .env.local or a live D1.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), "unwritten-verify-"));
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/KEY|TOKEN|SECRET|PASSWORD|DATABASE|^UNWRITTEN_|^CLOUDFLARE_|^CF_|^NODE_OPTIONS$|^SITES_/i.test(key)));
Object.assign(environment, {
  CI: "true", CLOUDFLARE_CF_FETCH_ENABLED: "false", WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: resolve(output, ".runtime/logs"),
  WRANGLER_REGISTRY_PATH: resolve(output, ".runtime/registry"),
  MINIFLARE_REGISTRY_PATH: resolve(output, ".runtime/miniflare"),
});
function run(command, args) {
  const result = spawnSync(command, args, { cwd: output, env: environment, stdio: "inherit", timeout: 300_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} ${args.join(" ")} failed (${result.status})`);
}
try {
  await mkdir(resolve(output, ".openai"), { recursive: true });
  await writeFile(resolve(output, ".openai/hosting.json"), JSON.stringify({ d1: "DB", r2: null }));
  await prepareHosted(output);
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  // Exercise the updated schema-generation dependency in the temporary copy only.
  await writeFile(resolve(output, "drizzle.config.ts"), `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "./db/schema.ts", out: "./drizzle", dialect: "sqlite" });\n`);
  async function migrationDigest(directory) {
    const hash = createHash("sha256");
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(entry.name);
      const path = resolve(directory, entry.name);
      hash.update(entry.isDirectory() ? await migrationDigest(path) : await readFile(path));
    }
    return hash.digest("hex");
  }
  const migrations = resolve(output, "drizzle");
  const before = await migrationDigest(migrations);
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate"]);
  if (await migrationDigest(migrations) !== before)
    throw Error("Schema changes have no committed migration; generate and review migrations first");
  run(process.execPath, ["scripts/build-worker.mjs"]);
  run(process.execPath, ["scripts/validate-artifact.mjs"]);
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
  // Run the built Worker, without platform auth, secrets or persistent user data.
  const socket = createServer();
  await new Promise((done, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", done); });
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  const worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev",
    "--config", "wrangler.json", "--local", "--ip", "127.0.0.1",
    "--port", String(port), "--inspector-port", "0", "--persist-to", resolve(output, ".worker-state")],
    { cwd: output, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let failure;
  worker.on("error", (error) => { failure = error; });
  const exited = new Promise((done) => worker.once("close", done));
  // Drain bounded startup output; never retain or upload runtime logs.
  worker.stdout.resume(); worker.stderr.resume();
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (failure) throw failure;
      if (worker.exitCode !== null) throw Error("Built Worker exited before readiness");
      try {
        const response = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(1000) });
        if (response.status !== 401) throw Error(`Unauthenticated status returned ${response.status}`);
        ready = true;
      } catch (error) {
        if (error.message.startsWith("Unauthenticated")) throw error;
        await delay(200);
      }
    }
    if (!ready) throw Error("Built Worker readiness timed out");
    const scene = await fetch(`${base}/api/scene`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(3000),
    });
    if (scene.status !== 401) throw Error(`Unauthenticated scene returned ${scene.status}`);
    const home = await fetch(base, { signal: AbortSignal.timeout(3000) });
    if (home.status !== 200 || !(await home.text()).includes('data-edition="mobile-cloud"'))
      throw Error("Built Worker failed to serve the mobile application");
  } finally {
    worker.kill("SIGTERM");
    const force = setTimeout(() => worker.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(force);
  }
  console.log("Hosted schema, Worker build, types, self-contained artifact and unauthenticated HTTP rejection passed.");
} finally {
  await rm(output, { recursive: true, force: true });
}
