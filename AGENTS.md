# Agent workflow

Architecture and browser/server boundaries are checked by `npm run lint` (`biome.json`); formatter is disabled. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for ownership, synthetic test data and AI integration requirements.

## Verify changes

Use Node.js 24 LTS and install with `npm ci`. Run `npm run check` for every change; it runs lint, syntax checks and the Node test suite. `npm run lint` and `node --test` can also be run separately.

Run `npm run test:e2e` after browser UI, game flow, shared browser modules, server routing or mobile build changes, and before a release. Install the test browsers first with `npx playwright install chromium webkit`. Playwright starts its own synthetic servers on 4397/4398 and covers desktop, narrow mobile and iPhone WebKit; it needs loopback ports and browser process permissions. No real AI or personal saves are used. For hosted Worker/build changes also run `npm run check:hosted`; use `npm run check:release` for release preparation.

Start the local app with `npm run dev` and open http://127.0.0.1:4341 (or the configured `PORT`). With synthetic inputs check profile entry and guided/bulk editing, AI connection/consent, starting a game, choosing a direction and revealing annual results, career offers, save export/import with storage off and on, resume, comparison and the ending résumé; check keyboard focus and a narrow viewport. Real AI checks require a separately authorized connection and may incur cost; synthetic E2E does not verify real model quality.

For manual browser checks without a real AI connection, run `node scripts/e2e-server.mjs` and open http://127.0.0.1:4397 (PC) or http://127.0.0.1:4398 (mobile). Keep test inputs synthetic and stop the server afterward. Browser checks blocked by the environment must be reported as unverified.
