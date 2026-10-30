import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse, serialize } from "parse5";

// The phone edition is the owner's private hosted app: OpenAI through the
// same-origin Worker. There is no offline edition, since play needs the AI.
export async function buildMobile(output) {
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
    "book.js",
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
    .update(JSON.stringify(["mobile-cloud", [...sources]]))
    .digest("hex")
    .slice(0, 16);
  for (const file of files) {
    const content = file.endsWith(".js")
      ? sources
          .get(file)
          .replace(
            /(\bfrom\s+["'])\.\/(engine|world|careers|story|book)\.js(["'])/g,
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
  const requireElement = (id) => {
    const element = elements.get(id);
    if (!element) throw new Error(`スマホ版の書き換え対象 #${id} が見つかりません。`);
    return element;
  };
  const setText = (element, value) => {
    element.childNodes = [{ nodeName: "#text", value, parentNode: element }];
  };
  const copy = {
    "about-ai-copy": "現在の職歴と過去の選択から、OpenAIが5年ごとのキャリアの場面と4択を自動で作ります。このスマホ版は、あなた専用のOpenAI接続を使います。AIの接続が必要です。",
    "privacy-ai-copy": "5年ごとの場面と方針をつくるため、プロフィールと選択履歴をOpenAIへ送ります。APIキーはサーバー側で管理し、端末へ配布しません。セーブは任意でこのブラウザ内に保存します。節目の一行はAIへ送信しません。共有ブラウザからは保存を見られる可能性があります。",
    "privacy-research-copy": "会社の候補を検索するときだけ、企業名をWikidataへ送ります。候補は利用者が確認します。外部ページから会社情報を取り込む機能は、この版では使いません。",
    "command-help": "コマンドをタップして決定 · キーボードは↑↓とEnter · Spaceで一時停止",
    "reflection-note": "セーブに残る自分用の記録です。AIには送りません。書かなくても年月は進みます。",
    "ai-description": "このスマホ版は、あなた専用のOpenAI接続で5年ごとの場面と方針を自動で作ります。プロフィールと選択履歴をOpenAIへ送ります。累計の見積り上限$5まで。自動再試行はしません。セーブはこの端末内です。",
    "ai-settings-button": "AIの利用について ↗",
    "ai-dialog-title": "AIで、次のキャリアを描く。",
  };
  for (const [id, value] of Object.entries(copy)) setText(requireElement(id), value);
  requireElement("ai-form").attrs.push({ name: "hidden", value: "" });
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
    value: "mobile-cloud",
  });
  const head = html.childNodes.find((n) => n.tagName === "head");
  const csp = parse(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://www.wikidata.org/w/api.php; object-src 'none'; base-uri 'none'; form-action 'none'">`,
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "head").childNodes[0];
  csp.parentNode = head;
  head.childNodes.unshift(csp);
  const body = html.childNodes.find((n) => n.tagName === "body");
  const banner = parse(
    '<aside class="mobile-edition-banner"><strong>スマホ版 · OpenAIで5年ごとに生成</strong><span>場面と選択肢をつくるため、プロフィールと選択履歴をOpenAIへ送ります。見積り累計$5まで。セーブはこの端末のブラウザに保存します。</span></aside>',
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "body").childNodes[0];
  banner.parentNode = body;
  body.childNodes.unshift(banner);
  if (!sources.get("index.html").includes("LOCAL EDITION / 0.3"))
    throw new Error("スマホ版の書き換え対象 LOCAL EDITION / 0.3 が見つかりません。");
  await writeFile(
    resolve(target, "index.html"),
    serialize(document).replace("LOCAL EDITION / 0.3", "HOSTED CAREER / 0.3"),
  );
  return { output: target, files: ["index.html", ...files], revision };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  // --cloud is accepted for older commands; every build is the hosted edition.
  if (args.includes("--cloud")) args.splice(args.indexOf("--cloud"), 1);
  if (args.length && (args.length !== 2 || args[0] !== "--output"))
    throw new Error(
      "使い方: npm run build:mobile -- --output 出力先",
    );
  console.log(JSON.stringify(await buildMobile(args[1])));
}
