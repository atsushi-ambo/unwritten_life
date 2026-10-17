import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeAI } from "./lib/ai.mjs";
import { makeCompanySearch } from "./lib/company.mjs";
import { companyPage } from "./lib/network.mjs";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/engine.js", ["engine.js", "text/javascript"]],
  ["/world.js", ["world.js", "text/javascript"]],
  ["/careers.js", ["careers.js", "text/javascript"]],
  ["/story.js", ["story.js", "text/javascript"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
async function bodyJSON(req) {
  let length = 0,
    parts = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024 * 1024)
      throw new Error("送信内容が容量の上限を超えました。");
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export function makeServer({
  ai = makeAI(),
  research = companyPage,
  searchCompanies = makeCompanySearch(),
} = {}) {
  const token = randomBytes(32).toString("hex");
  let windowStart = Date.now(),
    requests = 0;
  return createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    const host = req.headers.host ?? "";
    if (
      !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (req.url === "/api/status" && req.method === "GET") {
      if (req.headers.origin && req.headers.origin !== `http://${host}`) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      return json(res, 200, { token, ai: ai.status() });
    }
    if (req.url?.startsWith("/api/")) {
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        return res.end("Method not allowed");
      }
      const given = String(req.headers["x-unwritten-token"] ?? "");
      if (
        req.headers.origin !== `http://${host}` ||
        !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "") ||
        !/^[a-f0-9]{64}$/.test(given) ||
        !timingSafeEqual(Buffer.from(given), Buffer.from(token))
      ) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      if (Date.now() - windowStart > 60000) {
        windowStart = Date.now();
        requests = 0;
      }
      if (++requests > 60)
        return json(res, 429, {
          error: "操作が多いため、少し時間をおいてください。",
        });
      try {
        const body = await bodyJSON(req);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error("JSONオブジェクトを指定してください。");
        if (req.url === "/api/ai/models")
          return json(res, 200, { models: await ai.models(body.provider) });
        if (req.url === "/api/company/search")
          return json(res, 200, {
            candidates: await searchCompanies(body.name),
          });
        if (req.url === "/api/ai/config")
          return json(res, 200, { ai: await ai.configure(body) });
        if (req.url === "/api/scene")
          return json(
            res,
            200,
            await ai.generate(body.save, body.cloudConsent),
          );
        if (req.url === "/api/company")
          return json(res, 200, { facts: await research(body.url) });
        return json(res, 404, { error: "Unknown endpoint" });
      } catch (error) {
        return json(res, 400, {
          error:
            error instanceof SyntaxError
              ? "JSON形式を確認してください。"
              : error.message,
        });
      }
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end("Method not allowed");
    }
    const asset = assets.get(req.url);
    if (!asset) {
      res.writeHead(404);
      return res.end("Not found");
    }
    try {
      const data = await readFile(
        new URL(`./public/${asset[0]}`, import.meta.url),
      );
      res.writeHead(200, {
        "Content-Type": `${asset[1]}; charset=utf-8`,
        "Content-Length": data.length,
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(500);
      res.end("Unable to serve application");
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid PORT");
  const server = makeServer();
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.listen(port, "127.0.0.1", () =>
    console.log(`UNWRITTEN LIFE: http://127.0.0.1:${port}`),
  );
}
