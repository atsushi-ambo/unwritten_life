# サブスクの利用枠でAIを接続する調査

確認日：2026-10-17。ここは接続方式の調査・設計であり、CLI接続はまだ実装していない。ログインや、CLIからの推論は実行していない。

## 調査結果

| 候補 | 利用枠と実行方法 | このゲームへの方針 |
| --- | --- | --- |
| OpenAI / Codex | ローカル・OSSアプリ向けにSign in with ChatGPTでプランの利用枠を使う公式経路がある。Codex app-serverとも接続できる。 | 最優先候補。新規の接続はアプリ自身のSign in with ChatGPTを優先し、既存CLI認証をアプリから読み出す方式にはしない。 |
| Anthropic / Claude Code | 現在は公式の `claude -p`、Agent SDK、第三者アプリでもサブスク枠を使えると案内されている。Max・Teamでは月次APIクレジットの選択肢もある。 | 公式CLIまたは公式SDKの経路を用いる。APIキー経由とサブスクのログインを区別する。 |
| Google / Gemini CLI | 個人のGoogleログイン、Google AI Pro/Ultraの枠に対応。ログイン済みの認証は非対話実行でも使われる。 | 追加候補。CLIへの事前ログインを必要とし、APIキー・Vertex経由の従量課金と分ける。 |
| OpenCode | CLIそのものは独立した無料の推論サービスではなく、選ぶプロバイダーや契約に依存する。公式資料にはChatGPT等の接続がある。Claude Pro/MaxのOAuth流用プラグインとは区別が必要。 | まず各社の公式接続を優先する。OpenCode経由のClaudeサブスク流用は採用しない。 |

OpenAIのapp-server資料は、既存のローカル・OSS用途での認証利用を説明する一方、商用・リモートホストのサービスとの違いを明示している。将来公開サイトをホストして全員を一人の契約で動かす方式へ、そのまま転用しない。利用者がそれぞれPCで実行し、自分のアカウントを接続する想定とする。

## 実装する場合の境界

- 接続方式をOllama、API、サブスク連携として選択できる形にする。CLIがPC内で動いても、推論データは各社のクラウドへ送られるため、送信先とプロフィール・家計・会社・履歴の確認を表示する。
- サブスク枠は普段の作業と共有する。無制限・永久無料とは表示しない。1年につき1回を基本に、キャッシュ・回数制限・キャンセルを共通化する。上限に達したら停止し、利用者がOllama等への変更を選べるようにする。
- 有料API、追加クレジット、別モデルへ自動で切り替えない。APIキー等の環境変数で、意図せず別課金の認証が選ばれない設計にする。
- CLIのログインは利用者が公式の画面・CLIで行う。既存の認証ファイルやトークンをゲーム側へコピーしない。ブラウザから任意の実行ファイル・コマンド・追加引数を渡せないようにする。
- 入力はシェル展開せず標準入力へ渡す。ゲーム用の独立した作業領域を用い、ファイル・シェル・MCP・フック等の権限を文章生成に不要な限り無効にする。JSONの形と許可された行動を検証し、時間・出力・同時実行数を制限する。
- CLI側のバージョン、ログイン方式、対象モデルで実際に検証する。コマンドが見つかることと、サブスク認証での生成成功を区別する。

## 公式資料

- [OpenAI: ChatGPT plan usage for OSS/local apps](https://developers.openai.com/siwc/token-sharing-open-source)
- [OpenAI: Codex app-serverとの接続](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [OpenAI: 既存app-server認証の扱い](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
- [Anthropic: Claude Agent SDKとプランの利用枠](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Anthropic: 非対話実行](https://code.claude.com/docs/en/headless)
- [Anthropic: Max/Teamの月次APIクレジット](https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans)
- [Google: Gemini CLI認証](https://geminicli.com/docs/get-started/authentication/)
- [Google: Gemini CLIの利用枠と課金](https://geminicli.com/docs/resources/quota-and-pricing/)
- [OpenCode: 接続先と認証](https://docs.opencode.ai/docs/providers/)
