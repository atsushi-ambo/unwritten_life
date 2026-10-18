import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildMobile } from "./build-mobile.mjs";
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
mobile.listen(4398, "127.0.0.1", () => pc.listen(4397, "127.0.0.1"));
async function cleanup() {
  pc.close(); mobile.close();
  await rm(output, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
