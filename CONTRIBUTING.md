# 開発する方へ

Node.js 24 LTS、`npm ci --ignore-scripts`、`npm run check`、`npm run audit` を使います。ゲームモデルは `public/engine.js`、場面の依頼は `public/story.js`、AI接続は `lib/ai.mjs`、公開URLの取得は `lib/network.mjs` です。

PRはmainを取り込んだブランチから作ります。`automerge` ラベルを付けると、CI（Check）が最新のコミットで全部成功した時点で自動でマージされます（所有者のPRだけ。仕組みはREADMEのCIの節）。ラベルなしのPRは手動でマージします。

テストには架空の人物・会社・金額を使い、有料APIや個人のセーブを持ち込まないでください。新しいモデル・接続方式を加える場合は送信項目、出力検証、費用、時間・容量上限、正常と拒否の両方を確認します。

公開前のプロジェクトです。一般公開・ライセンス・配布形式はまだ確定していません。
