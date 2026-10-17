import test from "node:test";
import assert from "node:assert/strict";
import { makeCompanySearch } from "../lib/company.mjs";

test("company lookup resolves known aliases without search and treats directories only as bounded candidates", async () => {
  const calls = [];
  const search = makeCompanySearch({
    transport: async (url) => {
      const u = new URL(url);
      calls.push(u);
      assert.equal(u.origin, "https://www.wikidata.org");
      return {
        status: 200,
        text: JSON.stringify(
          u.searchParams.get("action") === "wbsearchentities"
            ? {
                search: [
                  { id: "Q1", label: "合成企業" },
                  { id: "Q2", label: "同名企業" },
                  { id: "../bad" },
                ],
              }
            : {
                entities: {
                  Q1: {
                    labels: { ja: { value: "合成企業" } },
                    descriptions: { ja: { value: "日本の企業" } },
                    claims: {
                      P856: [
                        {
                          rank: "deprecated",
                          mainsnak: {
                            datavalue: { value: "https://old.example.com" },
                          },
                        },
                        {
                          rank: "preferred",
                          mainsnak: {
                            datavalue: { value: "http://official.example.com" },
                          },
                        },
                      ],
                    },
                  },
                  Q2: {
                    labels: { ja: { value: "同名企業" } },
                    descriptions: { en: { value: "technology company" } },
                    claims: {
                      P856: [
                        {
                          mainsnak: {
                            datavalue: { value: "javascript:alert(1)" },
                          },
                        },
                        {
                          mainsnak: {
                            datavalue: { value: "https://other.example.com" },
                          },
                        },
                      ],
                    },
                  },
                },
              },
        ),
      };
    },
  });
  assert.match((await search("任天堂株式会社"))[0].url, /nintendo.co.jp/);
  for (const [name, host] of [
    ["NTT DATA", "www.nttdata.com"],
    ["Mizuho Bank", "www.mizuhobank.co.jp"],
    ["中外製薬株式会社", "www.chugai-pharm.co.jp"],
  ]) {
    const result = await search(name);
    assert.equal(new URL(result[0].url).hostname, host);
  }
  assert.equal(calls.length, 0);
  const candidates = await search("合成企業");
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, "https://official.example.com/");
  assert.equal(candidates[0].directoryURL, "https://www.wikidata.org/wiki/Q1");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("search"), "合成企業");
  assert.ok(!calls[1].searchParams.get("ids").includes("bad"));
  await assert.rejects(() => search(""));
  await assert.rejects(() => search("x".repeat(61)));
  await assert.rejects(() => search("secret\nextra"));
});
test("no result and search failure never produce a guessed official URL", async () => {
  const none = makeCompanySearch({
    transport: async () => ({ status: 200, text: '{"search":[]}' }),
  });
  assert.deepEqual(await none("未登録の合成企業"), []);
  const broken = makeCompanySearch({
    transport: async () => ({ status: 503, text: "" }),
  });
  await assert.rejects(() => broken("合成企業"));
});
