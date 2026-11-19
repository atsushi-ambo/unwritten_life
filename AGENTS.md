# Agent workflow

Architecture and browser/server boundaries are checked by `npm run lint` (`biome.json`); formatter is disabled. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for ownership, synthetic test data and AI integration requirements.

## Verify changes

Use Node.js 24 LTS and install with `npm ci`. Run `npm run check` for every change; it runs lint, syntax checks and the Node test suite. `npm run lint` and `node --test` can also be run separately.

Run `npm run test:e2e` after browser UI, game flow, shared browser modules, server routing or mobile build changes, and before a release. Install the test browsers first with `npx playwright install chromium webkit`. Playwright starts its own synthetic servers on 4397/4398 and covers desktop, narrow mobile and iPhone WebKit; it needs loopback ports and browser process permissions. No real AI or personal saves are used. For hosted Worker/build changes also run `npm run check:hosted`; use `npm run check:release` for release preparation.

Start the local app with `npm run dev` and open http://127.0.0.1:4341 (or the configured `PORT`). With synthetic inputs check profile entry and guided/bulk editing, AI connection/consent, starting a game, choosing a direction and revealing annual results, career offers, save export/import with storage off and on, resume, comparison and the ending résumé; check keyboard focus and a narrow viewport. Real AI checks require a separately authorized connection and may incur cost; synthetic E2E does not verify real model quality.

For manual browser checks without a real AI connection, run `node scripts/e2e-server.mjs` and open http://127.0.0.1:4397 (PC) or http://127.0.0.1:4398 (mobile). Keep test inputs synthetic and stop the server afterward. Browser checks blocked by the environment must be reported as unverified.

## Goal

See [目的と権限](docs/design.md#目的と権限).

## Source of truth

- 目的は上記設計、利用者向けの現状は [README](README.md)。目的の食い違いは推測で変更せず所有者に確認する。
- 金額・状態・確率はゲーム側の計算を正とし、AIの文章で上書きしない（[確率モデル](docs/probability-model.md#固定する部分とaiに任せる部分)）。歴史資料の原本は `public/world.js`、IndexedDBはそのコピー（[資料と保存先](docs/local-knowledge.md#資料と保存先)）。観測とゲームの仮定を混同しない。
- 現在の動作はコードとテストで確認し、旧セーブの再現と現在の生成仕様を区別する（[保存とプライバシー](README.md#保存とプライバシー)）。

## Done means

See [Verify changes](#verify-changes): 依頼したゲーム操作と保存互換性を確認し、変更に対応する検査を通す。記載の画面操作は手動確認、実AIの品質・実機は未実施なら未検証として報告する。[配備](README.md#検証)は別途許可された場合だけ行い、実装・配備・外部確認を分けて報告する。
