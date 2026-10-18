import test from "node:test";
import assert from "node:assert/strict";
import { makeHostedWorker } from "../lib/hosted-worker.mjs";
const origin = "https://synthetic.example";
const assets = { "index.html": "<!doctype html><h1>Synthetic</h1>", "app.js": "export const synthetic = true;" };
test("Worker serves only allowlisted assets with security headers and rejects unsupported routes/methods", async () => {
  const worker = makeHostedWorker(assets);
  for (const [path, method, status] of [["/", "GET", 200], ["/app.js?v=test", "GET", 200],
    ["/", "HEAD", 200], ["/", "POST", 405], ["/.env.local", "GET", 404],
    ["/worker/index.js", "GET", 404], ["/../package.json", "GET", 404],
    ["/api/ai/config", "POST", 404], ["/constructor", "GET", 404]]) {
    const response = await worker.fetch(new Request(origin + path, { method }), {});
    assert.equal(response.status, status, `${method} ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
    if (method === "HEAD") assert.equal(await response.text(), "");
  }
});
test("Worker uses only Sites identity and server bindings, preserving CSRF/auth checks before AI use", async () => {
  const requests = [];
  const worker = makeHostedWorker(assets, (bindings) => ({
    status: async (request, user) => {
      requests.push({ bindings, request, user });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": "synthetic=token; Secure; HttpOnly" } });
    },
    scene: async (request, user) => { requests.push({ bindings, request, user }); return new Response("ok"); },
  }));
  const headers = { "oai-authenticated-user-id": "synthetic-id", "oai-authenticated-user-email": "synthetic@example.invalid" };
  const db = {};
  const response = await worker.fetch(new Request(origin + "/api/status", { headers }), { DB: db, OPENAI_API_KEY: "synthetic-not-a-real-key", UNWRITTEN_ORIGIN: origin });
  assert.equal(requests[0].bindings.db, db);
  assert.equal(requests[0].bindings.origin, origin);
  assert.deepEqual(requests[0].user, { userId: "synthetic-id", email: "synthetic@example.invalid" });
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  const real = makeHostedWorker(assets);
  for (const [path, method] of [["/api/status", "GET"], ["/api/scene", "POST"]]) {
    assert.equal((await real.fetch(new Request(origin + path, { method }), { UNWRITTEN_ORIGIN: origin })).status, 401);
    assert.equal((await real.fetch(new Request(origin + path, { method, headers: { "oai-authenticated-user-id": "synthetic-id" } }), { UNWRITTEN_ORIGIN: origin })).status, 401);
  }
});
