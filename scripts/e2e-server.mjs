import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildMobile } from "./build-mobile.mjs";
import { makeHostedWorker } from "../lib/hosted-worker.mjs";
import { makeServer } from "../server.mjs";
import { decodeSave, validateGeneratedScene, sceneKey } from "../public/engine.js";
import { storyRequest, groundScene } from "../public/story.js";
import { fourReply } from "../test/fixtures/ai-replies.js";

// No model discovery, credentials, external requests or billable AI in browser
// tests. A synthetic AI answers instantly through the real validation path.
function fakeScene(save, mode = "life") {
  const game = decodeSave(save);
  const reply = fourReply(storyRequest(game, { mode }).context);
  const scene = groundScene(validateGeneratedScene(reply, game, { mode }), game);
  return { scene, turn: sceneKey(game), model: "e2e-synthetic", cached: false };
}
let calls = 0;
const accounting = (cloud) => ({
  provider: cloud ? "openai" : "ollama", model: "e2e-synthetic", ready: true, verifiedAt: "2026-10-19T00:00:00.000Z", verificationSeconds: 0.01, cloud,
  baseURL: cloud ? "https://api.openai.com/v1" : "http://127.0.0.1:11434",
  calls, reservedUSD: 0, requestCap: cloud ? 2000 : 100, usdCap: cloud ? 5 : 1, inputRate: 0, outputRate: 0, busy: false,
});
const ai = {
  status: () => accounting(false),
  models: async () => [{ id: "e2e-synthetic", size: null }],
  configure: async () => accounting(false),
  generate: async (save, _consent, { mode } = {}) => {
    calls++;
    return { ...fakeScene(save, mode), accounting: accounting(false) };
  },
};
const pc = makeServer({ ai,
  research: async () => { throw Error("External research disabled in browser tests"); },
  searchCompanies: async () => [],
});

// The phone edition runs the real Worker routing and headers with a synthetic API.
const hostedAPI = () => ({
  status: async () => Response.json({ token: "a".repeat(64), ai: accounting(true) }),
  scene: async (request) => {
    const body = await request.json();
    if (body.cloudConsent !== true) return Response.json({ error: "consent" }, { status: 400 });
    calls++;
    return Response.json({ ...fakeScene(body.save, body.mode), accounting: accounting(true) });
  },
});
const output = await mkdtemp(resolve(tmpdir(), "unwritten-browser-mobile-"));
const files = (await buildMobile(output)).files;
const assets = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(resolve(output, file), "utf8")])));
const worker = makeHostedWorker(assets, hostedAPI);
const mobile = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const result = await worker.fetch(new Request(`http://127.0.0.1:4398${request.url}`, {
    method: request.method, headers: new Headers(request.headers), ...(body.length ? { body } : {}),
  }), { UNWRITTEN_ORIGIN: "http://127.0.0.1:4398" });
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
mobile.listen(4398, "127.0.0.1", () => pc.listen(4397, "127.0.0.1"));
async function cleanup() {
  pc.close(); mobile.close();
  await rm(output, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
