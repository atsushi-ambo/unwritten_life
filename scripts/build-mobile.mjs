import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse, serialize } from "parse5";

export async function buildMobile(output, { cloud = false } = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = resolve(output ?? resolve(root, "artifacts/mobile"));
  const protectedPaths = [
    root,
    resolve(root, "public"),
    resolve(root, "scripts"),
    resolve(root, "lib"),
    resolve(root, "test"),
  ];
  if (
    target === dirname(target) ||
    protectedPaths.some(
      (p) => target === p || (target.startsWith(p + sep) && p !== root),
    )
  )
    throw new Error("ソースやルートディレクトリを出力先にはできません。");
  await mkdir(target, { recursive: true });
  const publicDir = resolve(root, "public");
  if ((await realpath(target)) === (await realpath(publicDir)))
    throw new Error("ソースへの出力はできません。");
  const files = [
    "app.js",
    "engine.js",
    "world.js",
    "careers.js",
    "story.js",
    "styles.css",
    "favicon.svg",
  ];
  const sources = new Map(
    await Promise.all(
      ["index.html", ...files].map(async (file) => [
        file,
        await readFile(resolve(publicDir, file), "utf8"),
      ]),
    ),
  );
  // All modules share a content revision, including their transitive imports.
  // A deployment must never combine cached JS with a newer HTML contract.
  const revision = createHash("sha256")
    .update(JSON.stringify([cloud, [...sources]]))
    .digest("hex")
    .slice(0, 16);
  for (const file of files) {
    const content = file.endsWith(".js")
      ? sources
          .get(file)
          .replace(
            /(\bfrom\s+["'])\.\/(engine|world|careers|story)\.js(["'])/g,
            `$1./$2.js?v=${revision}$3`,
          )
      : sources.get(file);
    await writeFile(resolve(target, file), content);
  }
  const document = parse(sources.get("index.html"));
  // Keep the shared runtime's element IDs, but specialize copy and hide PC
  // controls in the generated HTML too (before JavaScript has loaded).
  const elements = new Map();
  const collect = (element) => {
    const id = element.attrs?.find((a) => a.name === "id")?.value;
    if (id) elements.set(id, element);
    for (const child of element.childNodes ?? []) collect(child);
  };
  collect(document);
  const setText = (element, value) => {
    element.childNodes = [{ nodeName: "#text", value, parentNode: element }];
  };
  const copy = {
    "edition-privacy": cloud
      ? "キャリアは端末内で進行 · OpenAIは同意して手動生成"
      : "キャリアは端末内で進行 · 好きなAIと手動交換できます",
    "about-ai-copy": cloud
      ? "現在の職歴と過去の選択から、OpenAIでキャリアの場面や4択を手動生成できます。送信内容を確認し、同意して生成します。好きなAIとの手動交換も使えます。AI未接続でも遊べます。"
      : "端末内でキャリアの場面と選択が続きます。AIを使う場合は、依頼文を好きなAIに渡して返答を取り込む手動交換ができます。接続しなくても遊べます。",
    "privacy-ai-copy": cloud
      ? "OpenAIへの送信は同意して生成を押したときだけです。APIキーはサーバー側で管理し、端末へ配布しません。セーブは任意でこのブラウザ内に保存します。節目の一行はAIへ送信しません。共有ブラウザからは保存を見られる可能性があります。"
      : "ゲームは端末内で進みます。手動交換では、依頼文と送信先を自分で確認してください。セーブは任意でこのブラウザ内に保存します。節目の一行はAIへ渡す依頼文に含めません。共有ブラウザからは保存を見られる可能性があります。",
    "privacy-research-copy": "会社の候補を検索するときだけ、企業名をWikidataへ送ります。候補は利用者が確認します。外部ページから会社情報を取り込む機能は、この版では使いません。",
    "command-help": "コマンドをタップして決定 · キーボードは↑↓とEnter",
    "reflection-note": "セーブに残る自分用の記録です。AIには送りません。空欄や×でも進めます。",
    "ai-description": cloud
      ? "OpenAIでキャリアの場面と選択肢を生成できます。送信内容を確認し、同意を入れて生成ボタンを押してください。累計の見積り上限$0.10・100回まで。自動生成と自動再試行はしません。セーブはこの端末内です。"
      : "AI未接続でも、各年のキャリアと選択の結果が続きます。AIを使う場合は、依頼文をコピーして好きなAIの返答を取り込めます。",
    "ai-settings-button": cloud ? "AIの利用について ↗" : "AIの手動交換について ↗",
    "ai-dialog-title": cloud ? "AIで、次のキャリアを描く。" : "好きなAIと、キャリアを描く。",
  };
  for (const [id, value] of Object.entries(copy)) setText(elements.get(id), value);
  elements.get("ai-form").attrs.push({ name: "hidden", value: "" });
  const hidePC = (element) => {
    if (element.attrs?.some((a) => a.name === "data-pc-only") ||
        ["research-button", "career-research"].includes(element.attrs?.find((a) => a.name === "id")?.value))
      element.attrs.push({ name: "hidden", value: "" });
    for (const child of element.childNodes ?? []) hidePC(child);
  };
  hidePC(document);
  const versionAssets = (element) => {
    for (const attr of element.attrs ?? [])
      if (
        ["src", "href"].includes(attr.name) &&
        files.some((f) => attr.value === `/${f}`)
      )
        attr.value += `?v=${revision}`;
    for (const child of element.childNodes ?? []) versionAssets(child);
  };
  versionAssets(document);
  const html = document.childNodes.find((n) => n.tagName === "html");
  html.attrs.push({
    name: "data-edition",
    value: cloud ? "mobile-cloud" : "mobile",
  });
  const head = html.childNodes.find((n) => n.tagName === "head");
  const csp = parse(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src ${cloud ? "'self' " : ""}https://www.wikidata.org/w/api.php; object-src 'none'; base-uri 'none'; form-action 'none'">`,
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "head").childNodes[0];
  csp.parentNode = head;
  head.childNodes.unshift(csp);
  const body = html.childNodes.find((n) => n.tagName === "body");
  const banner = parse(
    cloud
      ? '<aside class="mobile-edition-banner"><strong>キャリア体験版 · OpenAIは手動生成</strong><span>AI生成を押したときだけプロフィールと選択履歴をOpenAIへ送ります。見積り累計$0.10・100回まで。セーブはこの端末のブラウザに保存します。</span></aside>'
      : '<aside class="mobile-edition-banner"><strong>キャリア体験版 · 端末内で遊べます</strong><span>会社の候補を検索するときだけ企業名をWikidataへ送ります。AIは手動交換で使えます。このアプリからのAPI課金は発生しません。</span></aside>',
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "body").childNodes[0];
  banner.parentNode = body;
  body.childNodes.unshift(banner);
  await writeFile(
    resolve(target, "index.html"),
    serialize(document).replace("LOCAL EDITION / 0.3", cloud ? "HOSTED CAREER / 0.3" : "MOBILE CAREER / 0.3"),
  );
  return { output: target, files: ["index.html", ...files], revision };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const cloud = args.includes("--cloud");
  if (cloud) args.splice(args.indexOf("--cloud"), 1);
  if (args.length && (args.length !== 2 || args[0] !== "--output"))
    throw new Error(
      "使い方: npm run build:mobile -- [--cloud] --output 出力先",
    );
  console.log(JSON.stringify(await buildMobile(args[1], { cloud })));
}
