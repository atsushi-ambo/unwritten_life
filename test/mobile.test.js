import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { buildMobile } from "../scripts/build-mobile.mjs";
test("phone build contains only public assets and is always the hosted OpenAI edition", async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), "unwritten-mobile-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await buildMobile(dir);
  assert.equal(result.files.length, 8);
  assert.deepEqual((await readdir(dir)).sort(), result.files.sort());
  const html = await readFile(resolve(dir, "index.html"), "utf8");
  assert.match(html, /data-edition="mobile-cloud"/);
  assert.match(html, /name="careerInterests"/);
  assert.doesNotMatch(html, /career-rule-fallback|exchange-dialog|value="disabled"/);
  const story = await readFile(resolve(dir, "story.js"), "utf8");
  assert.match(story, /careerInterests: p.careerInterests/);
  assert.match(story, /使う場合も最大1社まで/);
  assert.match(html, /connect-src 'self' https:\/\/www\.wikidata\.org\/w\/api\.php;/);
  for (const id of [
    "export-save", "game-export-save", "import-save", "game-import-save",
    "import-save-file", "save-import-dialog", "export-corrupt-save",
  ]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /accept="application\/json"/);
  assert.doesNotMatch(html, /\son(?:click|change)=|<script[^>]*>\s*[^<\s]/i);
  const scriptURL = new URL(
    html.match(/<script[^>]+src="([^"]+)"/)[1],
    "https://example.test",
  );
  assert.equal(scriptURL.searchParams.get("v"), result.revision);
  for (const file of result.files.filter((f) => f.endsWith(".js"))) {
    const js = await readFile(resolve(dir, file), "utf8");
    for (const match of js.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const dependency = new URL(match[1], scriptURL);
      assert.equal(dependency.searchParams.get("v"), result.revision);
      assert.ok(result.files.includes(dependency.pathname.slice(1)));
    }
  }
  assert.match(html, new RegExp(`/styles\\.css\\?v=${result.revision}`));
  const source = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /data-edition="mobile/);
  await assert.rejects(
    () => buildMobile(resolve(new URL("../public/", import.meta.url).pathname)),
    /ソース/,
  );
});
test("hosted mobile uses only same-origin scene requests and does not claim that AI is free", async (t) => {
  const dir = await mkdtemp(resolve(tmpdir(), "unwritten-cloud-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await buildMobile(dir);
  const html = await readFile(resolve(dir, "index.html"), "utf8");
  assert.match(html, /data-edition="mobile-cloud"/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /OpenAIで毎年自動生成/);
  assert.match(html, /\$5/);
  assert.doesNotMatch(html, /API課金は発生しません/);
  const app = await readFile(resolve(dir, "app.js"), "utf8");
  const requests = [];
  const context = createContext({
    hosted: true,
    apiToken: "synthetic-csrf-token",
    crypto: { randomUUID: () => "synthetic-request-id" },
    fetch: async (path, options) => {
      requests.push({ path, options });
      return { ok: true, json: async () => ({}) };
    },
  });
  runInContext(
    app.slice(
      app.indexOf("async function api("),
      app.indexOf("function readStoredGame("),
    ),
    context,
  );
  await assert.rejects(
    () => runInContext('api("/api/ai/config", {})', context),
    /接続設定/,
  );
  await runInContext(
    'api("/api/scene", {save:"synthetic",cloudConsent:true})',
    context,
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/scene");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    save: "synthetic",
    cloudConsent: true,
    requestId: "synthetic-request-id",
  });
  assert.equal(
    requests[0].options.headers["X-Unwritten-Token"],
    "synthetic-csrf-token",
  );
});
