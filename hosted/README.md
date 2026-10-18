# スマホ向けの本人限定Worker

対象は [スマホ体験版](https://unwritten-life-mobile.fairyvole9.chatgpt.site)。Sitesの本人限定公開と、既存D1の累計利用枠を維持します。APIキーはSitesの秘密情報にあり、ソース・配布物・ログへ含めません。承認済みのローカル `.env.local` は権限600・Git対象外です。

## 例外を残さない依存構成

以前のHigh 8件は、Next/Vinextの開発用glob依存が同じbracesの未修正DoSを参照したものでした。画面はHTML/JavaScriptだけで動くため、フレームワークと未使用のUI・lint依存を削除しました。Sitesが対応するWorker ESM形式へ必要なアプリと静的アセット8ファイルをまとめ、自己完結した `dist/server/index.js` を配備します。実行時のnpm依存・動的な外部importはありません。

`npm run audit:all` は開発用を含む全依存を検査し、重大度を問わず警告を拒否します。旧bracesの期限付き例外は削除しました。スキーマ生成用のDrizzle Kitと型検査・ビルド・ローカルWorker検証用のツールはロックし、推移依存esbuildも修正版へ固定しています。

## 認証・通信・上限

- Sites dispatchが渡すサーバー側のユーザーIDとメールの両方を必須とし、欠ければstatus/scene APIは401。本人以外を拒否するSitesの公開範囲を維持します。直接公開する別Workerや公開Siteへこの構成を転用しないでください。サインイン経路はSitesが管理します。
- `OPENAI_API_KEY` と `UNWRITTEN_ORIGIN` はサーバー側の設定のみ。ブラウザから接続先・単価・上限は変更できません。同一Origin・JSON・同意、Secure/HttpOnly/SameSite=StrictのCSRF Cookieとヘッダーを検証します。
- AIは手動生成のみ。固定のOpenAI Chat Completions、GPT-6 Luna、Standard、推論なし、出力1500token、90秒、返答128KB。ツール・Web検索・転送・自動再試行・購入・チャージはしません。返答の4択・長さ・数値表現の検証はPC版と共有します。
- D1に累計見積り$0.10・100回のうち先に達した上限と、同時実行ロック・リクエストIDを原子的に保存します。失敗も数え、再配備・再読み込みでリセットしません。中断したロックは2分で失効します。単価は2026-10-17の公式価格の2倍で保守的に予約しますが、提供者の実請求額や残高を直接制御するものではありません。
- D1には予約額・回数・ロック・ランダムなID・開始時刻・状態のみを保存します。プロフィール・勤務先・生成文章・キーは記録しません。セーブは任意でブラウザ内に保存します。
- パスは配信対象8ファイルとstatus/scene APIだけを許可。秘密情報やソースは配信しません。CSP、nosniff、no-store、Referrer/Permissions Policyを付けます。Wikidataの企業検索は既存の明示操作だけで、許可する接続先を限定します。

## 準備・検証・配備

```sh
# 認証情報やSite IDの入っていない別ディレクトリでも検証できます。
node scripts/prepare-hosted.mjs /absolute/path/to/worker-checkout
npm run check:release
```

`prepare-hosted` は既存の `.openai/hosting.json` を変更せず、ゲームのアセット、共有バックエンド、Worker入口、固定依存、スキーマと適用済みマイグレーションをコピーします。Worker用の正式なmanifestは既存Site ID、`d1: "DB"`、`r2: null` を維持し、`static` は付けません。生成用の `wrangler.json` はローカル検証専用で配備識別情報ではありません。

`npm run check:hosted` は資格情報を除いた一時環境でnpm ci、スキーマ生成とマイグレーション漏れ検査、自己完結したWorkerビルド、Sites公式スターター由来のESM検証、型検査、実Workerのトップページ200と未認証API401を検証し、プロセスと一時環境を削除します。`test/hosted.test.js` は実SQLiteで同意・CSRF・上限・再送・並列・障害・不正なAI返答を検証します。

ブラウザ検証はChromiumのPC/320px/生成済みスマホ版390pxと、iPhone相当WebKitの静的版・Worker版で、年の進行・巻き戻し・保存復元・保存削除を確認します。すべて合成データで、AIは無効です。これはスマホ実機そのものの確認とは区別します。

配備はSitesスキルのソース同期・検証済みアーカイブ・本人限定配備を使います。データベースの削除・初期化・マイグレーションの書き換えはしません。問題時は以前の保存済みバージョンへ戻し、D1累計は残します。更新後は実際のURLで認証済みstatus、画面操作と利用上限の保持を確認します。
