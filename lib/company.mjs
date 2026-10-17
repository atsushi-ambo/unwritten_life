import { EMPLOYERS } from "../public/careers.js";
import { requestText } from "./network.mjs";

const normalize = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|[\s・.]/gu, "");
const aliases = {
  microsoft: ["マイクロソフト", "日本マイクロソフト"],
  toyota: ["トヨタ", "toyota"],
  nintendo: ["nintendo", "ニンテンドー"],
  layerx: ["レイヤーエックス"],
};
export function makeCompanySearch({ transport = requestText } = {}) {
  async function wikidata(params) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({ format: "json", ...params });
    const r = await transport(url.href, { timeout: 10000, maxBytes: 512000 });
    if (r.status !== 200)
      throw new Error(
        "企業名の検索に接続できませんでした。時間をおいて再度お試しください。",
      );
    const d = JSON.parse(r.text);
    if (d.error) throw new Error("企業名を検索できませんでした。");
    return d;
  }
  return async function search(name) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 60 ||
      /[\u0000-\u001f\u007f]/u.test(name)
    )
      throw new Error("調べたい企業名を60文字以内で入力してください。");
    const query = normalize(name.trim());
    for (const [id, c] of Object.entries(EMPLOYERS)) {
      if (
        c.kind === "real" &&
        [c.name, id, ...(c.aliases ?? []), ...(aliases[id] ?? [])].some(
          (s) => normalize(s) === query,
        )
      ) {
        return [
          {
            name: c.name,
            url: c.url,
            description: c.summary,
            sector: c.sector,
            directory: "公式資料リスト",
          },
        ];
      }
    }
    const result = await wikidata({
      action: "wbsearchentities",
      search: name.trim(),
      language: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
        name,
      )
        ? "ja"
        : "en",
      uselang: "ja",
      limit: "5",
      type: "item",
    });
    const hits = (Array.isArray(result.search) ? result.search : [])
      .filter((x) => /^Q\d+$/.test(x.id))
      .slice(0, 5);
    if (!hits.length) return [];
    const data = await wikidata({
      action: "wbgetentities",
      ids: hits.map((h) => h.id).join("|"),
      props: "labels|descriptions|claims",
      languages: "ja|en",
    });
    const candidates = [];
    for (const hit of hits) {
      const entity = data.entities?.[hit.id];
      if (!entity || entity.missing !== undefined) continue;
      // A person, settlement or given name is not an employer candidate.
      const description =
        entity.descriptions?.ja?.value ??
        entity.descriptions?.en?.value ??
        hit.description ??
        "";
      if (
        !/企業|会社|法人|組織|銀行|大学|コングロマリット|メーカー|製造|持株|事業|サービス|company|corporation|business|bank|organization|enterprise|conglomerate|studio|manufacturer/iu.test(
          description,
        )
      )
        continue;
      const claims = (entity.claims?.P856 ?? []).filter(
        (c) => c.rank !== "deprecated" && !c.qualifiers?.P582,
      );
      const preferred = claims.some((c) => c.rank === "preferred")
        ? claims.filter((c) => c.rank === "preferred")
        : claims;
      const localized = [...preferred].sort(
        (a, b) =>
          Number(
            /\/(?:ja|jp|ja-jp)(?:\/|$)/i.test(
              b.mainsnak?.datavalue?.value ?? "",
            ),
          ) -
          Number(
            /\/(?:ja|jp|ja-jp)(?:\/|$)/i.test(
              a.mainsnak?.datavalue?.value ?? "",
            ),
          ),
      );
      for (const claim of localized) {
        const value = claim.mainsnak?.datavalue?.value;
        if (typeof value !== "string") continue;
        try {
          const u = new URL(value);
          // Only the HTTPS version is eligible, including old HTTP directory entries.
          if (u.protocol === "http:") u.protocol = "https:";
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            u.hash ||
            u.href.length > 2048 ||
            (u.port && u.port !== "443")
          )
            continue;
          if (candidates.some((c) => new URL(c.url).hostname === u.hostname))
            continue;
          candidates.push({
            name: String(
              entity.labels?.ja?.value ?? entity.labels?.en?.value ?? hit.label,
            ).slice(0, 60),
            url: u.href,
            description: String(description).slice(0, 180),
            directory: "Wikidataの公式サイト項目（候補）",
            directoryURL: `https://www.wikidata.org/wiki/${hit.id}`,
            sector: "unknown",
          });
          break;
        } catch {
          /* malformed directory data is ignored */
        }
      }
    }
    return candidates.slice(0, 3);
  };
}
