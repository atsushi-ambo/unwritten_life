import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { makeServerRevision, STALE_NOTICE } from "../lib/server-revision.mjs";
import { makeServer } from "../server.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "unwritten-revision-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "lib"));
  await mkdir(join(dir, "public"));
  const files = ["server.mjs", "lib/ai.mjs", "public/engine.js", "public/story.js", "public/world.js", "public/careers.js"];
  for (const file of files) await writeFile(join(dir, file), "// startup\n");
  let now = 0;
  const revision = await makeServerRevision({ root: pathToFileURL(dir + "/"), now: () => now });
  return { dir, revision, files, tick() { now += 3000; } };
}

test("startup revision covers all server modules and imported browser modules with a throttled disk check", async (t) => {
  const { dir, revision, files, tick } = await fixture(t);
  const startup = await revision();
  assert.match(startup.serverRevision, /^[a-f0-9]{64}$/);
  assert.equal(startup.stale, false);
  await writeFile(join(dir, "public/app.js"), "// frontend only\n");
  tick();
  assert.deepEqual(await revision(), startup);
  for (const file of [...files, "lib/new-module.mjs"]) {
    await writeFile(join(dir, file), "// changed\n");
    assert.deepEqual(await revision(), startup, "cached for three seconds");
    tick();
    const concurrent = await Promise.all([revision(), revision()]);
    for (const state of concurrent) {
      assert.equal(state.serverRevision, startup.serverRevision);
      assert.equal(state.stale, true, file);
    }
    if (files.includes(file)) await writeFile(join(dir, file), "// startup\n");
    else await rm(join(dir, file));
    tick();
    assert.deepEqual(await revision(), startup);
  }
  await rm(join(dir, "lib/ai.mjs"));
  tick();
  assert.equal((await revision()).stale, true, "missing sources fail closed");
});

// Exercise the actual request handler without a socket, alongside the real HTTP
// integration tests in server.test.js (which still require loopback permission).
function request(server, url, { method = "GET", headers = {}, body = "{}" } = {}) {
  return new Promise((resolve) => {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { url, method, headers: { host: "127.0.0.1:4317", ...headers } });
    const res = { statusCode: 200, setHeader() {}, writeHead(code) { this.statusCode = code; }, end(text) { resolve({ status: this.statusCode, data: JSON.parse(text) }); } };
    server.emit("request", req, res);
  });
}

test("/api/status exposes the startup hash and stale; valid config and generation are blocked after source updates", async (t) => {
  const { dir, revision, tick } = await fixture(t);
  let configs = 0, generations = 0;
  const server = makeServer({ revision, ai: {
    status: () => ({ ready: true }),
    configure: async () => { configs++; return { ready: true }; },
    generate: async () => { generations++; return {}; },
  } });
  const initial = await request(server, "/api/status");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.stale, false);
  assert.match(initial.data.serverRevision, /^[a-f0-9]{64}$/);
  const headers = { origin: "http://127.0.0.1:4317", "content-type": "application/json", "x-unwritten-token": initial.data.token };
  assert.equal((await request(server, "/api/ai/config", { method: "POST", headers })).status, 200);
  assert.equal((await request(server, "/api/scene", { method: "POST", headers, body: '{"choiceVersion":1}' })).status, 200);
  await writeFile(join(dir, "public/engine.js"), "// new engine\n");
  tick();
  const updated = (await request(server, "/api/status")).data;
  assert.equal(updated.serverRevision, initial.data.serverRevision);
  assert.equal(updated.stale, true);
  for (const url of ["/api/ai/config", "/api/scene"]) {
    const blocked = await request(server, url, { method: "POST", headers });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.error, STALE_NOTICE);
  }
  assert.equal(configs, 1);
  assert.equal(generations, 1);
});
