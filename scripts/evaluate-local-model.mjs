// Opt-in, local-only production-path evaluation. Never imports server.mjs or
// reads environment credentials, browser storage, personal saves or profiles.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { makeAI } from "../lib/ai.mjs";
import { requestText } from "../lib/network.mjs";
import {
  encodeSave,
  advance,
  applyScene,
  decodeSave,
  validateGeneratedScene,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import { memoryStopReason } from "./local-memory.mjs";
import { modelEvaluationCases } from "./model-eval-fixtures.mjs";

const [model, suite = "screen", seedText = "2026"] = process.argv.slice(2);
const sampleSeed = Number(seedText),
  base = "http://127.0.0.1:11434";
if (
  process.platform !== "darwin" ||
  !model ||
  !/^[a-zA-Z0-9_.:/@-]{1,150}$/.test(model) ||
  /cloud/i.test(model) ||
  !["screen", "full"].includes(suite) ||
  !Number.isSafeInteger(sampleSeed) ||
  sampleSeed < 0 ||
  sampleSeed > 2147483647
)
  throw Error(
    "Usage: node scripts/evaluate-local-model.mjs INSTALLED_LOCAL_MODEL [screen|full] [SEED]",
  );
const localJSON = async (path, body) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error(`Ollama ${path}: ${r.status}`);
  return r.json();
};
const installed = (await localJSON("/api/tags")).models.find(
  (m) => m.name === model,
);
if (!installed || installed.remote_host || installed.remote_model)
  throw Error("Select an installed local model");
if ((await localJSON("/api/ps")).models.length)
  throw Error("A model is already loaded; wait before evaluation");
const memory = () => ({
  pressure: execFileSync("/usr/bin/memory_pressure", ["-Q"], {
    encoding: "utf8",
  }).trim(),
  swap: execFileSync("/usr/sbin/sysctl", ["vm.swapusage"], {
    encoding: "utf8",
  }).trim(),
});
const stamp = new Date().toISOString();
const report = {
  date: stamp,
  model,
  digest: installed.digest,
  size: installed.size,
  suite,
  sampleSeed,
  protocol: "app-makeAI-personalized-four-v1",
  conditions: {
    backgroundModelDownloads:
      process.env.EVAL_BACKGROUND_DOWNLOADS === "1" ? true : null,
  },
  options: { temperature: 0.7, num_ctx: 8192, num_predict: 1500, think: false },
  fixturesHash: createHash("sha256")
    .update(
      await readFile(new URL("./model-eval-fixtures.mjs", import.meta.url)),
    )
    .digest("hex"),
  sourceHashes: {},
  before: memory(),
  results: [],
};
for (const file of [
  "../lib/ai.mjs",
  "../public/story.js",
  "../public/engine.js",
  "./evaluate-local-model.mjs",
]) {
  report.sourceHashes[file] = createHash("sha256")
    .update(await readFile(new URL(file, import.meta.url)))
    .digest("hex");
}
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
const output = new URL(
  `../artifacts/eval-${model.replace(/[^a-z0-9.-]/gi, "_")}-${suite}-${sampleSeed}-${stamp.replace(/[^0-9TZ]/g, "")}.json`,
  import.meta.url,
);
const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
let startedInference = false;
try {
  for (const fixture of modelEvaluationCases().filter(
    (f) => suite === "full" || f.screen,
  )) {
    const result = {
      id: fixture.id,
      mode: fixture.mode,
      review: fixture.review,
      context: storyRequest(fixture.game, { mode: fixture.mode }).context,
      memorySamples: [],
    };
    const controller = new AbortController();
    const ai = makeAI({
      transport: async (url, options) => {
        if (url !== base + "/api/chat") return requestText(url, options);
        const payload = JSON.parse(options.body);
        if (payload.model !== model || options.headers.Authorization)
          throw Error("Unexpected evaluation destination or credentials");
        payload.options.seed = sampleSeed;
        result.request = payload;
        startedInference = true;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "error",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(options.timeout),
          ]),
        });
        let size = 0;
        const chunks = [];
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > options.maxBytes) {
            controller.abort();
            throw Error("Response exceeds production byte limit");
          }
          chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString("utf8");
        result.http = response.status;
        try {
          result.raw = JSON.parse(text);
        } catch {
          result.rawText = text;
        }
        return { status: response.status, text };
      },
    });
    await ai.configure({ provider: "ollama", model, requestCap: 1 });
    const timer = setInterval(() => {
      try {
        const sample = memory();
        result.memorySamples.push(sample);
        const reason = memoryStopReason(report.before, sample);
        if (reason) {
          report.stoppedReason = reason;
          controller.abort(Error(reason));
        }
      } catch (error) {
        report.stoppedReason = "Memory monitoring failed";
        controller.abort(error);
      }
    }, 10000);
    const start = performance.now();
    try {
      const generated = await ai.generate(encodeSave(fixture.game), false, {
        personalized: true,
        mode: fixture.mode,
      });
      result.scene = generated.scene;
      result.cached = generated.cached;
      if (generated.cached) throw Error("Evaluation must not use cache");
      const raw = JSON.parse(
        result.raw.message.content
          .replace(/^\s*```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, ""),
      );
      const normalized = validateGeneratedScene(raw, fixture.game, {
        mode: fixture.mode,
      });
      result.normalized = !isDeepStrictEqual(raw, normalized);
      result.correctedBody = normalized.body !== generated.scene.body;
      result.bodyCharacters = [...normalized.body].length;
      result.execution = generated.scene.options.map((o) => {
        const next = advance(
          applyScene(fixture.game, generated.scene),
          o.decision ?? o.id,
        );
        const restored = decodeSave(encodeSave(next));
        if (!isDeepStrictEqual(next, restored))
          throw Error("Chosen action did not round-trip");
        return {
          id: o.id,
          nextYear: next.year,
          employer: next.employer.name,
          intention: next.history.at(-1)?.intention,
        };
      });
      result.accepted = true;
    } catch (error) {
      result.accepted = false;
      result.error = error.message;
    } finally {
      clearInterval(timer);
      result.seconds = (performance.now() - start) / 1000;
      // Keep the case and its inference error even if diagnostics fail.
      try {
        result.memory = memory();
        result.loaded = await localJSON("/api/ps");
      } catch (error) {
        result.diagnosticsError = error.message;
      }
    }
    report.results.push(result);
    report.stoppedReason ??= result.memory
      ? memoryStopReason(report.before, result.memory)
      : "Memory or model status unavailable";
    await save();
    console.log(
      JSON.stringify({
        model,
        suite,
        id: result.id,
        accepted: result.accepted,
        seconds: Math.round(result.seconds * 10) / 10,
        corrected: result.correctedBody,
        characters: result.bodyCharacters,
        error: result.error,
      }),
    );
    if (report.stoppedReason || result.http === 400 || result.http === 500)
      break;
  }
} finally {
  try {
    if (startedInference)
      await localJSON("/api/generate", { model, keep_alive: 0 });
  } catch (error) {
    report.cleanupError = error.message;
  }
  report.after = memory();
  await save();
}
console.log(`Saved ${output.pathname}`);
if (report.stoppedReason) process.exitCode = 2;
else if (report.cleanupError || report.results.some((r) => !r.accepted))
  process.exitCode = 1;
