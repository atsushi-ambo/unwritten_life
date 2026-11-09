import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: `${tmpdir()}/unwritten-playwright-results`,
  use: { baseURL: "http://127.0.0.1:4397", trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
    { name: "mobile-edition", use: { baseURL: "http://127.0.0.1:4398", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"], baseURL: "http://127.0.0.1:4398" } },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:4397",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
