import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

test("model refresh preserves installed selections, prefers installed Gemma, and otherwise keeps the first model", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const recommended = "gemma4:12b-it-q4_K_M";
  for (const [previous, configured, models, expected] of [
    ["qwen3:8b", recommended, ["other", recommended, "qwen3:8b"], "qwen3:8b"],
    ["", "qwen3:8b", ["other", recommended, "qwen3:8b"], "qwen3:8b"],
    ["missing", "missing", ["other", recommended], recommended],
    ["", "missing", ["other", recommended], recommended],
    ["missing", "missing", ["other", "qwen3:8b"], "other"],
    ["missing", "missing", [], ""],
  ]) {
    const elements = new Map();
    const $ = (id) => {
      if (!elements.has(id)) elements.set(id, { value: "" });
      return elements.get(id);
    };
    const select = $("ai-local-model");
    select.value = previous;
    select.children = [];
    select.replaceChildren = () => {
      select.children = [];
      select.value = "";
    };
    select.append = (option) => {
      select.children.push(option);
      if (select.children.length === 1) select.value = option.value;
    };
    $("ai-provider").value = "ollama";
    const context = createContext({
      $,
      aiState: { model: configured },
      modelListRevision: 0,
      renderLocalGuide() {},
      node: (_tag, textContent) => ({ textContent }),
      api: async (path, body) => {
        assert.equal(path, "/api/ai/models");
        assert.equal(body.provider, "ollama");
        return { models: models.map((id) => ({ id, size: null })) };
      },
    });
    runInContext(
      app.slice(
        app.indexOf("async function refreshModels()"),
        app.indexOf('$("refresh-models").addEventListener'),
      ),
      context,
    );
    await runInContext("refreshModels()", context);
    assert.equal(select.value, expected);
    assert.equal(select.children.length, models.length);
    assert.equal($("refresh-models").disabled, false);
    assert.match(
      $("model-list-status").textContent,
      models.length ? /個のモデルから選べます/ : /モデルがありません/,
    );
  }
});
