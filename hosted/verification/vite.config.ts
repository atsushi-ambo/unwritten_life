import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "./build/sites-vite-plugin";
export default defineConfig({
  plugins: [vinext(), sites({ mockAuth: false }), cloudflare({
    viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    inspectorPort: false,
    config: {
      main: "./build/sites-worker.ts",
      compatibility_date: "2026-10-17",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [{binding: "DB", database_name: "verification-only", database_id: "00000000-0000-4000-8000-000000000000"}],
    },
  })],
});
