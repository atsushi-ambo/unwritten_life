import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { buildMobile } from "../scripts/build-mobile.mjs";
test("new careers stop AI requests on an older running server without switching providers or stopping the game", async () => {
  const app = await readFile(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  const context = createContext({
    standalone: false,
    serverCareerOffers: false,
    game: { profile: { job: "tech" }, decisions: [] },
  });
  runInContext(
    app.slice(
      app.indexOf("function needsCareerServerUpdate()"),
      app.indexOf("const generationTimes"),
    ),
    context,
  );
  assert.equal(
    Boolean(runInContext("needsCareerServerUpdate()", context)),
    false,
  );
  context.game.decisions = [{ id: "switch", target: "mizuho", role: "tech" }];
  assert.equal(
    Boolean(runInContext("needsCareerServerUpdate()", context)),
    true,
  );
  context.serverCareerOffers = true;
  assert.equal(
    Boolean(runInContext("needsCareerServerUpdate()", context)),
    false,
  );
  context.serverCareerOffers = false;
  context.game = { profile: { job: "marketing" }, decisions: [] };
  assert.equal(
    Boolean(runInContext("needsCareerServerUpdate()", context)),
    true,
  );
  context.standalone = true;
  assert.equal(
    Boolean(runInContext("needsCareerServerUpdate()", context)),
    false,
  );
});
test("mobile build contains only public assets, opts out of network calls, and keeps normal PC mode unchanged", async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), "unwritten-mobile-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await buildMobile(dir);
  assert.equal(result.files.length, 8);
  assert.deepEqual((await readdir(dir)).sort(), result.files.sort());
  const html = await readFile(resolve(dir, "index.html"), "utf8");
  assert.match(html, /data-edition="mobile"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /API課金は発生しません/);
  const source = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /data-edition="mobile"/);
  const app = await readFile(resolve(dir, "app.js"), "utf8");
  let rendered = 0;
  const context = createContext({
    standalone: true,
    aiState: null,
    renderAI: () => rendered++,
    fetch: () => {
      throw Error("must not fetch");
    },
  });
  runInContext(
    app.slice(
      app.indexOf("async function status()"),
      app.indexOf("async function api("),
    ),
    context,
  );
  runInContext(
    app.slice(
      app.indexOf("async function api("),
      app.indexOf("function readStoredGame("),
    ),
    context,
  );
  const status = await runInContext("status()", context);
  assert.equal(status.ai.provider, "disabled");
  assert.equal(status.ai.cloud, false);
  assert.equal(rendered, 1);
  for (const path of ["/api/scene", "/api/ai/config", "/api/company/search"]) {
    context.testPath = path;
    await assert.rejects(
      () => runInContext("api(testPath,{})", context),
      /スマホ体験版/,
    );
  }
  await assert.rejects(
    () => buildMobile(resolve(new URL("../public/", import.meta.url).pathname)),
    /ソース/,
  );
});
