import { env } from "cloudflare:workers";
import { makeHostedAPI } from "../lib/hosted-ai.mjs";

export function hostedAPI() {
  // Configured by Sites; never NEXT_PUBLIC_ values. Development has no API key.
  const bindings = env as unknown as {
    DB?: D1Database;
    OPENAI_API_KEY?: string;
    UNWRITTEN_ORIGIN?: string;
  };
  return makeHostedAPI({
    db: bindings.DB,
    apiKey: bindings.OPENAI_API_KEY,
    origin:
      bindings.UNWRITTEN_ORIGIN ||
      "https://unwritten-life-mobile.fairyvole9.chatgpt.site",
  });
}
