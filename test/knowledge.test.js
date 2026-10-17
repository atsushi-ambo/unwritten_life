import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  createGame,
  advance,
  encodeSave,
  decodeSave,
} from "../public/engine.js";
import {
  KNOWLEDGE,
  KNOWLEDGE_REVISION,
  KNOWLEDGE_DB,
  HISTORICAL_FACTS,
  knowledgeFor,
  loadKnowledge,
} from "../public/world.js";
import { storyRequest } from "../public/story.js";
import { makeAI } from "../lib/ai.mjs";

const profile = {
  age: 32,
  region: "city",
  job: "tech",
  income: 600,
  ai: "daily",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 500,
  monthlyCost: 12,
  companyType: "large",
  company: "株式会社NTTデータ",
  workModel: "services",
};
const ids = (refs) =>
  [...refs.historical, ...refs.companies, ...refs.rules].map((r) => r.id);
function openDB(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KNOWLEDGE_DB);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

test("catalog separates dated source facts from game assumptions and excludes fictional firms", () => {
  assert.equal(new Set(KNOWLEDGE.map((r) => r.id)).size, KNOWLEDGE.length);
  assert.equal(HISTORICAL_FACTS.length, 8);
  for (const r of KNOWLEDGE) {
    assert.ok(Object.isFrozen(r));
    assert.match(r.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.detail.length < 300);
    if (r.kind !== "game-rule") assert.equal(new URL(r.url).protocol, "https:");
    else assert.match(r.source, /ゲームの仮定/);
    assert.ok(!r.id.includes("machi"));
  }
});

test("relevant local material changes with work, family and the last action without rewriting history", () => {
  const base = createGame(profile, "steady", 42);
  const product = createGame(
    { ...profile, workModel: "product", company: "合成製品社" },
    "steady",
    42,
  );
  assert.ok(ids(knowledgeFor(base)).includes("rule-services"));
  assert.ok(!ids(knowledgeFor(product)).includes("rule-services"));
  assert.ok(ids(knowledgeFor(product)).includes("rule-product"));
  assert.ok(ids(knowledgeFor(base)).includes("company-nttdata"));
  assert.ok(
    !ids(knowledgeFor(product)).some((id) => id.startsWith("company-")),
  );
  assert.ok(!ids(knowledgeFor(base)).includes("rule-family"));
  const family = createGame(
    { ...profile, partner: "partner", children: 1, childStage: "young" },
    "steady",
    42,
  );
  assert.ok(ids(knowledgeFor(family)).includes("rule-family"));
  const studied = advance(base, {
    id: "studyDaily",
    intent: "顧客の課題を解く技術を毎日学ぶ",
  });
  assert.ok(ids(knowledgeFor(studied)).includes("rule-learning"));
  assert.ok(!ids(knowledgeFor(base)).includes("rule-learning"));
  assert.equal(studied.studyHours, 365);
  assert.notEqual(studied.skill, advance(base, "rest").skill);
  assert.deepEqual(decodeSave(encodeSave(studied)), studied);
  const before = JSON.stringify(HISTORICAL_FACTS);
  const future = { ...studied, year: 2050 };
  const context = storyRequest(future).context;
  assert.equal(JSON.stringify(HISTORICAL_FACTS), before);
  assert.ok(context.historicalReference.every((r) => r.asOf === "2026-10-17"));
  assert.ok(
    context.localKnowledge.companySnapshots.every(
      (r) => r.asOf === "2026-10-17",
    ),
  );
  assert.match(context.pastChoices.at(-1).intention, /顧客/);
});

test("only a bounded relevant packet reaches AI and no new call is needed to retrieve knowledge", async () => {
  const game = createGame(profile, "steady", 42);
  const context = storyRequest(game).context;
  assert.equal(context.localKnowledge.revision, KNOWLEDGE_REVISION);
  assert.ok(context.historicalReference.length <= 2);
  assert.ok(context.localKnowledge.gameAssumptions.length <= 4);
  assert.equal(context.localKnowledge.companySnapshots.length, 1);
  assert.ok(!JSON.stringify(context.historicalReference).includes('"tags"'));
  let calls = 0;
  const ai = makeAI({
    transport: async (_url, options) => {
      calls++;
      const payload = JSON.parse(options.body);
      const prompt = JSON.parse(payload.messages[1].content);
      assert.equal(prompt.localKnowledge.revision, KNOWLEDGE_REVISION);
      assert.ok(prompt.historicalReference.length <= 2);
      return {
        status: 200,
        text: JSON.stringify({
          message: {
            content: JSON.stringify({
              title: "今の仕事と次の学び",
              body: "顧客との経験を振り返り、来年の暮らしと学びを考える。",
              insight: "架空の提案。",
              options: ["learn", "rest", "connect"].map((id) => ({
                id,
                label: id,
                hint: "時間を配分する",
              })),
            }),
          },
        }),
      };
    },
  });
  const save = encodeSave(game);
  await ai.generate(save);
  await ai.generate(save);
  assert.equal(calls, 1);
});

test("IndexedDB persists only reviewed knowledge, reopens it, and repairs stale or tampered entries", async () => {
  const indexedDB = new IDBFactory();
  const first = await loadKnowledge({ indexedDB });
  assert.equal(first.storage, "indexeddb");
  assert.deepEqual(first.catalog, KNOWLEDGE);
  const second = await loadKnowledge({ indexedDB });
  assert.equal(second.storage, "indexeddb");
  assert.deepEqual(second.catalog, first.catalog);
  assert.notEqual(second.catalog, KNOWLEDGE); // read from the store, not the seed
  const db = await openDB(indexedDB);
  assert.deepEqual([...db.objectStoreNames].sort(), ["meta", "records"]);
  const tx = db.transaction(["records", "meta"], "readwrite");
  tx.objectStore("records").put({
    ...KNOWLEDGE[0],
    detail: "AIが作った偽の歴史",
  });
  tx.objectStore("records").put({
    id: "unreviewed",
    kind: "history",
    detail: "未来の会社発表",
  });
  tx.objectStore("meta").put({ id: "catalog", revision: KNOWLEDGE_REVISION });
  await transactionDone(tx);
  db.close();
  const repaired = await loadKnowledge({ indexedDB });
  assert.equal(repaired.storage, "indexeddb");
  assert.deepEqual(repaired.catalog, KNOWLEDGE);
  const reopened = await loadKnowledge({ indexedDB });
  assert.deepEqual(reopened.catalog, KNOWLEDGE);
  assert.ok(!JSON.stringify(reopened.catalog).includes(profile.company));
});

test("blocked, unavailable or failed storage falls back promptly without stopping play", async () => {
  for (const indexedDB of [
    null,
    {
      open() {
        throw Error("SecurityError");
      },
    },
    {
      open() {
        const request = {};
        queueMicrotask(() => request.onerror());
        return request;
      },
    },
    {
      open() {
        return {};
      },
    },
  ]) {
    const result = await loadKnowledge({ indexedDB, timeoutMs: 20 });
    assert.equal(result.storage, "bundled");
    assert.equal(result.catalog, KNOWLEDGE);
    assert.ok(
      ids(
        knowledgeFor(createGame(profile), { catalog: result.catalog }),
      ).includes("rule-services"),
    );
  }
});
