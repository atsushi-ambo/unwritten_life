import test from "node:test";
import assert from "node:assert/strict";
import { makeCompanySearch } from "../lib/company.mjs";

test("company lookup always asks the directory and treats it only as bounded candidates", async () => {
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
  const candidates = await search("合成企業");
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, "https://official.example.com/");
  assert.equal(candidates[0].directoryURL, "https://www.wikidata.org/wiki/Q1");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("search"), "合成企業");
  // There is no built-in company list: well-known names also go to the directory.
  assert.deepEqual(await search("NTT DATA"), candidates);
  assert.equal(calls.length, 4);
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

test("a legal-suffix fallback is bounded and companies sharing an official domain stay separate", async () => {
  const calls = [];
  const search = makeCompanySearch({
    transport: async (url) => {
      const u = new URL(url);
      calls.push(u);
      const isSearch = u.searchParams.get("action") === "wbsearchentities";
      return {
        status: 200,
        text: JSON.stringify(
          isSearch
            ? { search: calls.length === 1 ? [] : [{ id: "Q1" }, { id: "Q2" }] }
            : {
                entities: Object.fromEntries(
                  ["Q1", "Q2"].map((id, i) => [
                    id,
                    {
                      labels: { ja: { value: `合成企業${i}` } },
                      descriptions: { ja: { value: "日本の会社" } },
                      claims: {
                        P856: [
                          {
                            mainsnak: {
                              datavalue: {
                                value: `https://official.example.com/legal-${i}`,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ]),
                ),
              },
        ),
      };
    },
  });
  const result = await search("株式会社合成企業");
  assert.equal(calls.length, 3);
  assert.equal(calls[1].searchParams.get("search"), "合成企業");
  assert.equal(result.length, 2);
  assert.notEqual(result[0].entityId, result[1].entityId);
  assert.notEqual(result[0].url, result[1].url);
});
