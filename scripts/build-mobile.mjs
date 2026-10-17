import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  realpath,
} from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "parse5";

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
    "engine.js",
    "world.js",
    "careers.js",
    "story.js",
    "styles.css",
    "favicon.svg",
  ];
  for (const file of files)
    await copyFile(resolve(publicDir, file), resolve(target, file));
  const document = parse(
    await readFile(resolve(publicDir, "index.html"), "utf8"),
  );
  const html = document.childNodes.find((n) => n.tagName === "html");
  html.attrs.push({ name: "data-edition", value: "mobile" });
  const head = html.childNodes.find((n) => n.tagName === "head");
  const csp = parse(
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "head").childNodes[0];
  csp.parentNode = head;
  head.childNodes.unshift(csp);
  const body = html.childNodes.find((n) => n.tagName === "body");
  const banner = parse(
    '<aside class="mobile-edition-banner"><strong>スマホ体験版 · AI接続なし</strong><span>入力はこのブラウザで処理します。PCのAPIキーやセーブとは接続せず、API課金は発生しません。保存を選んだ場合はこの端末のブラウザに保存します。</span></aside>',
  )
    .childNodes.find((n) => n.tagName === "html")
    .childNodes.find((n) => n.tagName === "body").childNodes[0];
  banner.parentNode = body;
  body.childNodes.unshift(banner);
  await writeFile(
    resolve(target, "index.html"),
    serialize(document).replace("LOCAL EDITION / 0.3", "MOBILE DEMO / 0.3"),
  );
  return { output: target, files: ["index.html", ...files] };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output"))
    throw new Error("使い方: npm run build:mobile -- --output 出力先");
  console.log(JSON.stringify(await buildMobile(args[1])));
}
