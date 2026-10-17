# Unwritten Life

**自分のままで、いくつもの未来を。**

2026年の自分から、20年間の選択を体験する人生シミュレーションゲーム。AIが広がる速さを3通りに変え、同じ選択でどんな差が出るか比べられます。

## いま遊べること

- 年齢・地域・仕事内容・年収・AI利用経験・大切にしたいことの6項目から開始。
- 性別・暮らし・貯蓄・生活費・勤務先は任意。架空の人物でも体験可能。
- 毎年、学び・仕事・つながり・休養・挑戦を選び、収入と暮らしの変化を表示。
- 1年前への巻き戻し、同じ条件での再プレイ、AIの3シナリオ比較。
- 任意の端末保存、続きからの再開、保存削除。

初版 v0.1 はローカルで動くプロトタイプです。一般公開用の配備はしていません。リアルタイムの複数人対戦や公開投稿は含みません。

## 起動と検証

Node.js 24 LTS を推奨。24〜26で実行でき、追加パッケージやAPIキーは不要です。

```sh
cd /Users/atsushiambo/personal/app/unwritten_life
npm ci --ignore-scripts
npm run check
npm run audit
npm run dev
```

ブラウザで <http://127.0.0.1:4317> を開きます。終了は `Ctrl+C`。別ポートは `PORT=4318 npm run dev`。サーバーはPC内のループバック接続だけを受け付けます。

`npm run check` は構文チェック、モデルのテスト、実HTTPのテストを実行します。失敗・タイムアウトは失敗として扱います。ローカルとGitHub Actionsで同じ入口を使います。CIはNode 24と26で検証します。

GitHub ActionsはPR・mainへのpush・手動・週次で検証と依存検査を実行します。外部ActionsはコミットSHAで固定し、Dependabotで更新します。ランタイム依存は現時点で0件です。`npm audit`の合格はNode本体やアプリの安全性の保証ではありません。

## 個人情報と前提

プロフィールと選択の処理はブラウザ内で完結します。外部AIへの送信、アクセス解析、広告、Cookie、プロフィールを受け取るAPIはありません。端末保存は初期状態でオフ。オンにした場合、localStorageに入力と選択を保存します。同じブラウザを使う人から見られる可能性があり、暗号化された保管庫ではありません。「端末の保存を削除」または開始画面の「保存を削除」で消去できます。

会社名・性別は表示だけに使います。企業や個人の将来、寿命、病気は予測しません。収入・資産・健康・AI普及は独自のゲーム係数です。金額は2026年の購買力での概算で、税・年金・退職・運用益を実制度に沿って計算するモデルではありません。

前提と限界はゲーム内の「前提とプライバシー」、係数と検証方針は [docs/design.md](docs/design.md) を参照してください。

## 構成

```text
public/index.html    入力・ゲーム・比較の画面
public/styles.css    レスポンシブ表示
public/app.js        画面と任意の端末保存
public/engine.js     検証・計算・再現可能な再プレイ
server.mjs           公開対象を限定したローカルHTTPサーバー
test/                架空の入力のみを使う検証
```

サーバーは明示した静的ファイルだけを配信し、書き込み・不明なパス・未知のHostを拒否します。CSP等のヘッダーは `server.mjs` にあります。公開時はホスティング側でも同等の制御を設定し、HTTPS・キャッシュ・公開範囲を確認する必要があります。

## 参考

- [ILO / Generative AI and Jobs（2025）](https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure)
- [ILO / AI exposure indicators（2026-04-17）](https://www.ilo.org/resource/news/new-ilo-brief-explains-what-ai-exposure-indicators-reveal-about-jobs)
- [80億分の1](https://1in8b.life/ja/)：人生を選択しながら体験する着想。コード・文章・画像・統計モデルは流用していません。

確認日：2026-10-17。公開資料は個人への予測精度や、ゲーム係数を裏付けるものではありません。
