import test from "node:test";
import assert from "node:assert/strict";
import { makeCompanySearch } from "../lib/company.mjs";
import { companyMetadata } from "../public/careers.js";
import { companyPage } from "../lib/network.mjs";
import { parse } from "parse5";

test("an employer without a Wikidata website remains searchable through its linked article", async () => {
  const calls = [];
  const search = makeCompanySearch({ transport: async (url) => {
    const u = new URL(url); calls.push(u);
    return { status: 200, text: JSON.stringify(u.hostname === "ja.wikipedia.org" ? { parse: { text: { "*": '<table class="infobox"><tr><th>事業内容</th><td>ITインフラの構築と運用サービスを提供する会社です。</td></tr><tr><th>外部リンク</th><td><span><a href="https://official.example.com/jp/">公式</a></span></td></tr></table>' } } }
      : u.searchParams.get("action") === "wbsearchentities" ? { search: [{ id: "Q123", label: "合成ジャパン" }] }
      : { entities: { Q123: { labels: { ja: { value: "合成ジャパン" } }, descriptions: { ja: { value: "日本の企業" } }, claims: {}, sitelinks: { jawiki: { title: "合成ジャパン" } } } } }) };
  } });
  const [c] = await search("合成ジャパン株式会社");
  assert.equal(c.url, "https://official.example.com/jp/");
  assert.match(c.overview, /ITインフラ/);
  assert.equal(c.industry, "services");
  assert.match(c.overviewSource.title, /Wikipedia/);
  assert.equal(calls.find((u) => u.hostname === "ja.wikipedia.org").searchParams.get("section"), "0");
  assert.ok(calls.every((u) => ["www.wikidata.org", "ja.wikipedia.org"].includes(u.hostname)));
});

test("website labels outside the infobox never become an official candidate", () => {
  const m = companyMetadata(parse('<table><tr><th>外部リンク</th><td><a href="https://evil.example.com">fake</a></td></tr></table><p>合成企業についての公開された会社記事です。</p>'), "合成企業");
  assert.equal(m.website, null);
});

test("a missing, failed or invalid linked article never removes the known employer", async () => {
  for (const failure of ["missingtitle", "http", "long-title"]) {
    const search = makeCompanySearch({ transport: async (url) => {
      const u = new URL(url);
      return { status: failure === "http" && u.hostname === "ja.wikipedia.org" ? 503 : 200,
        text: JSON.stringify(u.hostname === "ja.wikipedia.org" ? { error: { code: "missingtitle" } }
          : u.searchParams.get("action") === "wbsearchentities" ? { search: [{ id: "Q123", label: "合成社" }] }
          : { entities: { Q123: { labels: { ja: { value: "合成社" } }, descriptions: { ja: { value: "日本の会社" } }, claims: {}, sitelinks: { jawiki: { title: failure === "long-title" ? "a".repeat(201) : "合成社" } } } } }) };
    } });
    const [candidate] = await search("合成社");
    assert.equal(candidate.name, "合成社"); assert.equal(candidate.url, null);
  }
});

test("metadata uses the named company even when a subsidiary is listed first", () => {
  const html = '<main><h2>別会社</h2><p><b>会社名</b>別会社</p><p><b>事業内容</b>別会社の商品販売</p><h2>合成企業</h2><p><b>会社名</b>合成企業株式会社</p><p><b>事業内容</b>ITインフラの運用サービスを提供しています。</p><h2>さらに別会社</h2><p><b>事業内容</b>他社の物流</p></main>';
  const m = companyMetadata(parse(html), "合成企業");
  assert.match(m.overview, /ITインフラ/); assert.doesNotMatch(m.overview, /商品販売|他社の物流/);
  const wiki = companyMetadata(parse('<table class="infobox"><tr><th>外部リンク</th><td><a href="https://official.example.com">公式</a></td></tr></table><table><tr><th>事業内容</th><td>別会社の商品販売</td></tr></table>'), "合成企業", { directory: true });
  assert.equal(wiki.fields.business, undefined); assert.equal(wiki.overview, "");
});

test("company profile follows one matching card and does not mix subsidiary business text", async () => {
  const calls = [];
  const facts = await companyPage("https://official.example.com/", { name: "合成企業", transport: async (url) => {
    calls.push(url);
    return { status: 200, url, headers: { "content-type": "text/html" }, text: url.endsWith("/company")
      ? '<title>合成企業の会社概要</title><main><p><b>会社名</b>合成企業株式会社</p><p><b>業種</b>情報通信業</p><p><b>事業内容</b>ITインフラの設計・構築と運用サービスを提供しています。</p><h2>別の子会社</h2><p><b>事業内容</b>別会社の商品販売</p></main>'
      : '<main><a href="/ai">AI戦略</a><article><h2>合成企業の会社概要</h2><a href="/company">詳しくはこちら</a></article><a href="https://evil.example.com/company">合成企業の会社概要</a></main>' };
  } });
  assert.deepEqual(calls, ["https://official.example.com/", "https://official.example.com/company"]);
  assert.match(facts.summary, /ITインフラ/);
  assert.doesNotMatch(facts.summary, /別会社の商品/);
  assert.equal(facts.industry, "services");
  assert.equal(facts.confirmed, false);
});

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

 test("unidentified official sections do not supply another company's structured facts", () => {
  const m = companyMetadata(parse('<main><p>会社名：合成企業</p><table><tr><th>事業内容</th><td>別会社の商品販売</td></tr><tr><th>業種</th><td>銀行</td></tr></table></main>'), "合成企業");
  assert.equal(m.fields.business, undefined); assert.equal(m.industry, "");
 });

test("a second named company ends metadata scope even without a heading", () => {
 const m=companyMetadata(parse('<main><table><tr><th>会社名</th><td>合成企業</td></tr><tr><th>会社名</th><td>別会社</td></tr><tr><th>事業内容</th><td>ITインフラの運用</td></tr><tr><th>業種</th><td>情報通信</td></tr></table></main>'), '合成企業');
 assert.equal(m.fields.business, undefined); assert.equal(m.industry, '');
 const empty=companyMetadata(parse('<main><p><b>会社名</b>合成企業</p><p>事業内容</p><p><b>業種</b>銀行</p></main>'), '合成企業');
 assert.equal(empty.fields.business, undefined);
 const unrelated=companyMetadata(parse('<main><p>これは別会社の事業に関する長い記事で対象の企業とは何の関係もない公開された説明です。</p></main>'), '合成企業');
 assert.equal(unrelated.overview, '');
});
