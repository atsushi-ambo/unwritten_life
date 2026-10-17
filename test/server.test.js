import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeServer } from "../server.mjs";
test("HTTP boundary: allowed assets, CSRF, local origin, body validation and secret rejection", async (t) => {
  let researched = false;
  const ai = {
    status: () => ({ provider: "disabled" }),
    configure: async () => ({ provider: "disabled" }),
    generate: async () => ({ scene: { title: "test" } }),
  };
  const server = makeServer({
    ai,
    research: async () => {
      researched = true;
      return { summary: "public" };
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Unwritten Life/);
  assert.match(
    home.headers.get("content-security-policy"),
    /connect-src 'self'/,
  );
  assert.match(
    home.headers.get("content-security-policy"),
    /form-action 'none'/,
  );
  assert.equal(home.headers.get("referrer-policy"), "no-referrer");
  assert.equal(home.headers.get("cache-control"), "no-store");
  for (const path of [
    "/app.js",
    "/engine.js",
    "/story.js",
    "/styles.css",
    "/favicon.svg",
  ])
    assert.equal((await fetch(base + path)).status, 200);
  for (const path of [
    "/.env",
    "/.git/config",
    "/server.mjs",
    "/lib/ai.mjs",
    "/package.json",
    "/%2e%2e/%2eenv",
    "/app.js?income=500",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal(
    (await fetch(base, { method: "POST", body: "private=test" })).status,
    405,
  );
  const { token } = await (await fetch(base + "/api/status")).json();
  const headers = {
    "Content-Type": "application/json",
    Origin: base,
    "X-Unwritten-Token": token,
  };
  assert.equal(
    (
      await fetch(base + "/api/company", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: "https://example.com" }),
      })
    ).status,
    200,
  );
  assert.equal(researched, true);
  for (const patch of [
    { "X-Unwritten-Token": "nope" },
    { "X-Unwritten-Token": "é".repeat(64) },
    { Origin: "https://attacker.example" },
    { "Content-Type": "text/plain" },
  ]) {
    const res = await fetch(base + "/api/company", {
      method: "POST",
      headers: { ...headers, ...patch },
      body: "{}",
    }).catch(() => null);
    if (res) assert.equal(res.status, 403);
  }
  assert.equal(
    (await fetch(base + "/api/scene", { method: "POST", headers, body: "bad" }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/status", {
        headers: { Origin: "https://attacker.example" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base, { method: "HEAD" })).status, 200);
  const foreign = await new Promise((resolve, reject) => {
    http
      .get(base, { headers: { host: "attacker.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(foreign, 403);
});
