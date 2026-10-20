import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { parse } from "parse5";
import { appPort } from "./port.mjs";

export function publicAddress(address) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function destination(input, allowLoopback = false) {
  const url = new URL(input);
  if (url.username || url.password || url.hash || url.href.length > 2048)
    throw new Error("認証情報やフラグメントのないURLを指定してください。");
  const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (loopback && allowLoopback) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.port ||
      Number(url.port) < 1024 ||
      Number(url.port) === appPort()
    )
      throw new Error("AI接続先のポートを確認してください。");
    return { url, address: "127.0.0.1", family: 4 };
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || loopback)
    throw new Error(
      "公開情報の取得先にはHTTPSの公開サイトを指定してください。",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let dnsTimer;
  let addresses;
  try {
    addresses = ipaddr.isValid(host)
      ? [
          {
            address: host,
            family: ipaddr.parse(host).kind() === "ipv4" ? 4 : 6,
          },
        ]
      : await Promise.race([
          lookup(host, { all: true }),
          new Promise((_, reject) => {
            dnsTimer = setTimeout(
              () => reject(new Error("名前解決がタイムアウトしました。")),
              5000,
            );
          }),
        ]);
  } finally {
    clearTimeout(dnsTimer);
  }
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("内部ネットワーク・予約アドレスには接続できません。");
  return { url, ...addresses[0] };
}
export async function requestText(
  input,
  {
    allowLoopback = false,
    method = "GET",
    body,
    headers = {},
    timeout = 15000,
    maxBytes = 512000,
  } = {},
) {
  const target = await destination(input, allowLoopback);
  const transport = target.url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const req = transport.request(
      target.url,
      {
        method,
        agent: false,
        family: target.family,
        lookup: (_hostname, options, callback) =>
          options.all
            ? callback(null, [
                { address: target.address, family: target.family },
              ])
            : callback(null, target.address, target.family),
        headers: { "User-Agent": "Unwritten-Life-local/0.2", ...headers },
      },
      (res) => {
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            const error = new Error("取得内容が容量の上限を超えました。");
            reject(error);
            res.destroy(error);
            req.destroy(error);
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const bytes = Buffer.concat(chunks);
            const hint =
              String(res.headers["content-type"] ?? "").match(
                /charset=["']?([\w-]+)/i,
              ) ??
              bytes
                .subarray(0, 4096)
                .toString("ascii")
                .match(/charset=["']?([\w-]+)/i);
            const text = new TextDecoder(hint?.[1] ?? "utf-8").decode(bytes);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text,
              url: target.url.href,
            });
          } catch {
            reject(new Error("ページの文字コードを読み取れませんでした。"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("接続がタイムアウトしました。")),
      timeout,
    );
    req.once("close", () => clearTimeout(timer));
    req.once("error", reject);
    req.end(body);
  });
}
export async function companyPage(input) {
  let url = input,
    response;
  for (let i = 0; i < 3; i++) {
    response = await requestText(url);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location || i === 2)
        throw new Error("転送が多いため取得を中止しました。");
      url = new URL(response.headers.location, url).href;
      continue;
    }
    break;
  }
  if (
    response.status !== 200 ||
    !/^text\/(html|plain)/i.test(response.headers["content-type"] ?? "")
  )
    throw new Error("公開ページの本文を取得できませんでした。");
  const tree = parse(response.text),
    texts = [],
    titles = [];
  function walk(n, title = false) {
    if (
      [
        "script",
        "style",
        "noscript",
        "nav",
        "footer",
        "header",
        "template",
      ].includes(n.tagName)
    )
      return;
    if (n.nodeName === "#text") {
      (title ? titles : texts).push(n.value);
      return;
    }
    for (const child of n.childNodes ?? [])
      walk(child, title || n.tagName === "title");
  }
  walk(tree);
  const summary = texts.join(" ").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (summary.length < 30)
    throw new Error(
      "読み取れる本文が少ないページです。内容を手動で入力してください。",
    );
  return {
    summary,
    sector: "unknown",
    confirmed: false,
    sources: [
      {
        url: response.url,
        title: titles.join(" ").trim().slice(0, 160),
        checkedAt: new Date().toISOString().slice(0, 10),
      },
    ],
  };
}
