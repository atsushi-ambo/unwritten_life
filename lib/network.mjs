import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { parse } from "parse5";
import { appPort } from "./port.mjs";
import { companyMetadata } from "../public/careers.js";

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
export async function companyPage(input, { name = "", transport = requestText, followed = false } = {}) {
  if (typeof name !== "string" || name.length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error("会社名を60文字以内で指定してください。");
  let url = input,
    response;
  for (let i = 0; i < 3; i++) {
    response = await transport(url, { timeout: 8000, maxBytes: 512000 });
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
  if (name && !followed) {
    const normalized = (s) => s.normalize("NFKC").toLowerCase().replace(/株式会社|有限会社|合同会社|[\s・.,（）()]/gu, "");
    const textOf = (root) => {
      const chunks = [], pending = [root];
      while (pending.length && chunks.join("").length < 1500) { const n = pending.pop(); if (n.nodeName === "#text") chunks.push(n.value); else pending.push(...Array.from(n.childNodes ?? []).reverse()); }
      return chunks.join(" ").replace(/\s+/gu, " ").trim();
    };
    const links = [], stack = [tree];
    while (stack.length) {
      const n = stack.pop();
      if (n.tagName === "a") {
        const ownLabel = textOf(n);
        let label = ownLabel, parent = n.parentNode;
        for (let level = 0; level < 2 && parent; level++, parent = parent.parentNode) { const context = textOf(parent); if (!["main", "body", "html"].includes(parent.tagName) && context.length <= 600) label += " " + context; }
        if (/会社概要|企業概要|会社情報|company profile|corporate profile/iu.test(label) && normalized(label).includes(normalized(name))) {
          try {
            const target = new URL(n.attrs?.find((a) => a.name === "href")?.value, response.url);
            const own = /会社概要|企業概要|会社情報|company profile|corporate profile/iu.test(ownLabel) && normalized(ownLabel).includes(normalized(name));
            const score = (own ? 100 : 0) + (/about|company|profile|corporate|overview/iu.test(target.pathname) ? 40 : 0) - (/news|press|blog|strategy/iu.test(target.pathname) ? 80 : 0);
            if (score >= 40 && target.origin === new URL(response.url).origin && target.href !== response.url && !target.hash && !target.username && !target.password) links.push({ url: target.href, score });
          } catch {}
        }
      }
      stack.push(...Array.from(n.childNodes ?? []).reverse());
    }
    if (links.length) {
      links.sort((a, b) => b.score - a.score);
      try { return await companyPage(links[0].url, { name, transport, followed: true }); } catch { /* The fetched source remains available if its overview link fails. */ }
    }
  }
  const metadata = companyMetadata(tree, name);
  const summary = (name ? metadata.overview : texts.join(" ").replace(/\s+/g, " ").trim()).slice(0, 1800);
  if (summary.length < 30)
    throw new Error(
      "読み取れる本文が少ないページです。内容を手動で入力してください。",
    );
  return {
    summary,
    sector: metadata.sector,
    industry: metadata.industry,
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
