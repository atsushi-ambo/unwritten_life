import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeServer } from "../server.mjs";

test("HTTP entry serves only app assets and rejects writes, traversal, secrets and foreign hosts", async (t) => {
  const server = makeServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Unwritten Life/);
  assert.match(
    home.headers.get("content-security-policy"),
    /connect-src 'none'/,
  );
  assert.match(
    home.headers.get("content-security-policy"),
    /form-action 'none'/,
  );
  assert.equal(home.headers.get("referrer-policy"), "no-referrer");
  assert.equal(home.headers.get("cache-control"), "no-store");
  for (const path of ["/app.js", "/engine.js", "/styles.css", "/favicon.svg"])
    assert.equal((await fetch(base + path)).status, 200);
  for (const path of [
    "/.env",
    "/.git/config",
    "/server.mjs",
    "/package.json",
    "/%2e%2e/%2eenv",
    "/app.js?income=500",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal(
    (await fetch(base, { method: "POST", body: "private=test" })).status,
    405,
  );
  const head = await fetch(base, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const foreignHost = await new Promise((resolve, reject) => {
    const req = http.get(
      base,
      { headers: { host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(foreignHost, 403);
});
