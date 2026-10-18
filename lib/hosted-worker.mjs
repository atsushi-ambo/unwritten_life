// @ts-check
import { makeHostedAPI } from "./hosted-ai.mjs";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://www.wikidata.org/w/api.php; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
};
/** @type {Record<string, string>} */
const types = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" };

// Identity headers are supplied/overwritten by Sites dispatch. The deployment
// MUST remain owner-private; never expose this Worker outside that boundary.
/**
 * @param {Record<string, string>} assets
 * @param {typeof makeHostedAPI} makeAPI
 */
export function makeHostedWorker(assets, makeAPI = makeHostedAPI) {
  return {
    /** @param {Request} request
     * @param {{DB?: D1Database, OPENAI_API_KEY?: string, UNWRITTEN_ORIGIN?: string}} env
     */
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      let response;
      if (["/api/status", "/api/scene"].includes(path)) {
        const userId = request.headers.get("oai-authenticated-user-id");
        const email = request.headers.get("oai-authenticated-user-email");
        const user = userId && email ? { userId, email } : null;
        const api = makeAPI({
          db: env.DB,
          apiKey: env.OPENAI_API_KEY,
          origin: env.UNWRITTEN_ORIGIN || "https://unwritten-life-mobile.fairyvole9.chatgpt.site",
        });
        response = await api[path === "/api/status" ? "status" : "scene"](request, user);
      } else {
        const file = path === "/" ? "index.html" : path.slice(1);
        if (!Object.hasOwn(assets, file)) response = new Response("Not found", { status: 404 });
        else if (!["GET", "HEAD"].includes(request.method))
          response = new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        else response = new Response(request.method === "HEAD" ? null : assets[file], {
          headers: { "Content-Type": `${types[file.split(".").at(-1) || ""] || "application/octet-stream"}; charset=utf-8` },
        });
      }
      const secured = new Response(response.body, response);
      for (const [key, value] of Object.entries(headers)) secured.headers.set(key, value);
      return secured;
    },
  };
}
