import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildMobile } from "./build-mobile.mjs";
import { makeHostedWorker } from "../lib/hosted-worker.mjs";
import { makeServer } from "../server.mjs";
// No model discovery, credentials, external requests or billable AI in browser tests.
const ai = {
  status: () => ({ provider: "disabled", ready: false, calls: 0, reservedUSD: 0, requestCap: 0, usdCap: 0 }),
  models: async () => [],
  configure: async () => { throw Error("AI disabled in browser tests"); },
  generate: async () => { throw Error("AI disabled in browser tests"); },
};
const pc = makeServer({ ai,
  research: async () => { throw Error("External research disabled in browser tests"); },
  searchCompanies: async () => [],
});

const output = await mkdtemp(resolve(tmpdir(), "unwritten-browser-mobile-"));
const { files } = await buildMobile(output);
const assets = new Map(await Promise.all(files.map(async (file) => [file, await readFile(resolve(output, file))])));
const types = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };
const mobile = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:4398").pathname;
  const file = path === "/" ? "index.html" : path.slice(1);
  if (request.method !== "GET" || !assets.has(file)) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { "content-type": `${types[file.split(".").at(-1)]}; charset=utf-8`, "cache-control": "no-store" });
  response.end(assets.get(file));
});
const cloudOutput = await mkdtemp(resolve(tmpdir(), "unwritten-browser-cloud-"));
const cloudFiles = (await buildMobile(cloudOutput, { cloud: true })).files;
const cloudAssets = Object.fromEntries(await Promise.all(cloudFiles.map(async (file) => [file, await readFile(resolve(cloudOutput, file), "utf8")])));
const cloudWorker = makeHostedWorker(cloudAssets);
const cloud = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const headers = new Headers(request.headers);
  // Synthetic dispatch identity only in this loopback test server. No key exists.
  headers.set("oai-authenticated-user-id", "synthetic-browser");
  headers.set("oai-authenticated-user-email", "synthetic@example.invalid");
  const body = Buffer.concat(chunks);
  const result = await cloudWorker.fetch(new Request(`http://127.0.0.1:4399${request.url}`, {
    method: request.method, headers, ...(body.length ? { body } : {}),
  }), { DB: { prepare: () => ({ first: async () => null }) }, UNWRITTEN_ORIGIN: "http://127.0.0.1:4399" });
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
cloud.listen(4399, "127.0.0.1", () => mobile.listen(4398, "127.0.0.1", () => pc.listen(4397, "127.0.0.1")));
async function cleanup() {
  pc.close(); mobile.close(); cloud.close();
  await rm(output, { recursive: true, force: true });
  await rm(cloudOutput, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
