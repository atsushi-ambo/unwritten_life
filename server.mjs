import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/engine.js", ["engine.js", "text/javascript"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
export function makeServer() {
  return createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    if (
      !/^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/.test(
        req.headers.host ?? "",
      )
    ) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end("Method not allowed");
    }
    const asset = assets.get(req.url);
    if (!asset) {
      res.writeHead(404);
      return res.end("Not found");
    }
    try {
      const body = await readFile(
        new URL(`./public/${asset[0]}`, import.meta.url),
      );
      res.writeHead(200, {
        "Content-Type": `${asset[1]}; charset=utf-8`,
        "Content-Length": body.length,
      });
      res.end(req.method === "HEAD" ? undefined : body);
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
