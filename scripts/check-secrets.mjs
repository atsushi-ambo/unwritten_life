import { spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(args, cwd = root, quiet = false) {
  const result = spawnSync("gitleaks", args, { cwd, stdio: quiet ? "pipe" : "inherit", timeout: 90_000 });
  if (result.error) throw result.error;
  return result.status;
}
const common = ["--redact", "--no-banner", "--ignore-gitleaks-allow", "--timeout", "60", "--config", resolve(root, ".gitleaks.toml")];
const snapshot = await mkdtemp(resolve(tmpdir(), "unwritten-secrets-"));
try {
  // Prove detection works, using an ephemeral fake token, never a real credential.
  await writeFile(resolve(snapshot, "probe.txt"), `token=ghp_${randomBytes(18).toString("hex")}\n`);
  if (run(["dir", ...common, snapshot], root, true) !== 1) throw Error("Secret detector self-test failed");
  await rm(resolve(snapshot, "probe.txt"));
  if (run(["git", ...common, "--log-opts=--all -- . :(exclude)artifacts/** :(exclude).claude/**"]) !== 0)
    throw Error("Secret detected in Git history, or scan failed");
  // Include changed/new source, but never traverse ignored local secrets/runtime data.
  const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (files.status !== 0) throw Error("Unable to enumerate source");
  for (const file of files.stdout.split("\0").filter(Boolean)) {
    if (/^(artifacts|\.claude)\//.test(file)) continue;
    const source = resolve(root, file);
    const stat = await lstat(source).catch((e) => { if (e.code !== "ENOENT") throw e; });
    if (!stat?.isFile()) continue;
    const target = resolve(snapshot, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  if (run(["dir", ...common, snapshot]) !== 0) throw Error("Secret detected in current source, or scan failed");
} finally {
  await rm(snapshot, { recursive: true, force: true });
}
