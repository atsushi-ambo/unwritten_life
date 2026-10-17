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
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src ${cloud ? "'self'" : "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'">`,
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "head").childNodes[0];
  csp.parentNode = head;
  head.childNodes.unshift(csp);
  const body = html.childNodes.find((n) => n.tagName === "body");
  const banner = parse(
    cloud
      ? '<aside class="mobile-edition-banner"><strong>スマホ体験版 · OpenAIは手動生成</strong><span>AI生成を押したときだけプロフィールと選択履歴をOpenAIへ送ります。見積り累計$0.10・100回まで。セーブはこの端末のブラウザに保存します。</span></aside>'
      : '<aside class="mobile-edition-banner"><strong>スマホ体験版 · AI接続なし</strong><span>入力はこのブラウザで処理します。PCのAPIキーやセーブとは接続せず、API課金は発生しません。保存を選んだ場合はこの端末のブラウザに保存します。</span></aside>',
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "body").childNodes[0];
  banner.parentNode = body;
  body.childNodes.unshift(banner);
  await writeFile(
    resolve(target, "index.html"),
    serialize(document).replace("LOCAL EDITION / 0.3", "MOBILE DEMO / 0.3"),
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
