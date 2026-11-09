import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { STALE_NOTICE } from "../lib/server-revision.mjs";

const exec = promisify(execFile);
test("launcher rejects stale or pre-revision servers without opening the browser", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "unwritten-launcher-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const state of [{ stale: true, serverRevision: "a".repeat(64) }, {}, { stale: false, serverRevision: "a".repeat(64) }]) {
    const stub = join(dir, "preload.mjs");
    await writeFile(stub, `import cp from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      cp.execFile = (_command, _args, callback) => { console.log("SYNTHETIC_BROWSER_OPEN"); callback(); };
      cp.spawn = () => { throw Error("must not start another server or CLI"); };
      syncBuiltinESMExports();
      globalThis.fetch = async () => ({ json: async () => (${JSON.stringify({ token: "synthetic", ai: {}, ...state })}) });`);
    const running = exec(process.execPath, ["--import", stub, fileURLToPath(new URL("../scripts/start.mjs", import.meta.url))], { timeout: 5000 });
    if (state.stale || !state.serverRevision) {
      await assert.rejects(running, (error) => {
        assert.equal(error.code, 1);
        assert.equal(error.stderr.trim(), STALE_NOTICE);
        assert.doesNotMatch(error.stdout, /SYNTHETIC_BROWSER_OPEN/);
        return true;
      });
    } else assert.match((await running).stdout, /SYNTHETIC_BROWSER_OPEN/);
  }
});
