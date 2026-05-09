# ohmh

[English](./README.md)

[Oh My Hooks](https://ohmh.satetsu888.dev) の CLI クライアント。グローバルインストール不要で、ユニークな URL に届いた webhook をローカルポートに転送する。

## クイックスタート

```bash
# ephemeral URL を払い出して localhost:3000 に転送 (ログイン不要)
npx ohmh --port 3000
```

最初の接続は anonymous な ephemeral webhook を使うので、単発のテストに向いている。アカウントに紐づく persistent な URL を使うには `ohmh login` を実行する。

## コマンド

| コマンド | 説明 |
|---|---|
| `ohmh [--port <port>] [--id <id>] [--anonymous] [--ready-file <path>]` | (default) `connect` のショートカット。引数なしで `npx ohmh --port 3000` のように使える |
| `ohmh connect [--port <port>] [--id <id>] [--anonymous] [--ready-file <path>]` | webhook を購読してローカルポートへ転送する。`--id` 省略時は ephemeral を作成、未ログインなら anonymous、ログイン済なら authenticated ephemeral。`--ready-file` を指定すると ready 時にファイルへ JSON 1 行 (`url`/`webhookId`/`mode`) を書く |
| `ohmh login` | ブラウザを開いて OAuth (PKCE) でサインイン、access token を保存する |
| `ohmh logout` | 保存された access token を破棄する |
| `ohmh whoami` | サインイン中のユーザーとプランを表示 (Metered プランでは今期の peak と推定請求額も) |
| `ohmh list` | 自分の persistent webhook を一覧表示 |
| `ohmh create` | persistent webhook を作成する |
| `ohmh delete <id> [--yes]` | webhook を削除する |
| `ohmh requests <id> [--limit <n>] [--offset <n>]` | persistent webhook の受信履歴を表示する (default limit=20) |
| `ohmh request <id> <reqId>` | 1 件のリクエストの全 headers / body を表示する |
| `ohmh resend <id> <reqId> --port <port>` | 過去のリクエストをローカルポートへ再送する (サーバ往復なし) |
| `ohmh schema` | NDJSON event の JSON Schema (Draft 2020-12) を stdout に出力する |

すべてのコマンドで以下のグローバルオプションが使える:

- `--base-url <url>` (env: `OH_MY_HOOKS_BASE_URL`) — API ベース URL を上書き (デフォルト `https://ohmh.satetsu888.dev`)
- `--json` — NDJSON 形式の機械可読出力に切り替える
- `-q, --quiet` — info レベルの出力を抑制
- `-v, --verbose` — debug 出力を有効化

`ohmh <command> --help` で各コマンドの詳細を確認できる。

## Exit codes

| Code | 意味 | 典型ケース |
|---|---|---|
| 0 | 成功 | |
| 1 | 一般エラー | 想定外の例外 |
| 2 | 認証エラー | 未ログイン / OAuth state mismatch |
| 3 | プラン上限到達 | persistent 作成で Free=0 / Metered=10 に到達 |
| 4 | 見つからない | webhook / request id が存在しない |
| 5 | 入力不正 | port 範囲外、必須フラグ未指定 |

## JSON event reference

`--json` を付けると stdout に NDJSON が出力される (人間向け prose は stderr に移る)。1 行 = 1 イベント。主要なイベント:

| サブコマンド | type | 主要フィールド |
|---|---|---|
| `connect` | `ready` | `mode` (`anonymous`/`ephemeral`/`persistent`), `webhookId`, `url`, `forwardPort` |
| `connect` | `request` | `ts`, `method`, `path`, `status`, `durationMs`, `error?`, `webhookId`, `sourceRequestId` |
| `list` | `list` | `webhooks` |
| `create` | `create` | `webhook` |
| `delete` | `delete` | `webhookId`, `deleted` |
| `requests` | `requests` | `webhookId`, `requests` |
| `request` | `request` | `request` (full detail) |
| `resend` | `resend` | `webhookId`, `requestId`, `port`, `status`, `durationMs`, `error` |
| `whoami` | `whoami` | `id`, `name`, `email`, `plan` |
| `login` | `login` | `baseUrl`, `name`, `email`, `plan` |
| `logout` | `logout` | `baseUrl` |

NDJSON consumer は **未知の `type` を無視する** こと (将来の event 追加でも壊れないようにするため)。詳細は `skills/ohmh/references/REFERENCE.md` 参照。

## AI エージェントから使う

AI エージェントから呼ぶ場合の最小ガイド:

- `connect` (default) は **長時間プロセス**。SIGINT までブロックするので background で起動する
- 必ず `--json` を付ける (stdout が NDJSON、stderr が prose に分離されてパースしやすくなる)
- `delete` は `--yes` 必須 (TTY が無いと confirm が default false → cancelled)
- `login` はブラウザ必須なので headless では不可

3 種類の起動パターン:

```bash
# (A) Stream-and-filter — agent が stdout streaming に対応している場合
npx ohmh --port 3000 --json | grep --line-buffered -E '"type":"(ready|request|error)"'

# (B) Done-file polling — `--ready-file` で ready の瞬間を ファイル touch で受け取る
npx ohmh --port 3000 --json --ready-file /tmp/ohmh.ready > /tmp/ohmh.ndjson &
until [ -f /tmp/ohmh.ready ]; do sleep 0.1; done
URL=$(jq -r .url /tmp/ohmh.ready)

# (C) NDJSON file polling — fallback
npx ohmh --port 3000 --json > /tmp/ohmh.ndjson 2>/tmp/ohmh.log &
until grep -q '"type":"ready"' /tmp/ohmh.ndjson; do sleep 0.2; done
URL=$(jq -r 'select(.type=="ready") | .url' /tmp/ohmh.ndjson | head -1)
```

イベントの JSON Schema (Draft 2020-12) を機械的に取りたい場合は `ohmh schema | jq` を使う。

[Agent Skills 仕様](https://agentskills.io/specification) 準拠の skill が `skills/ohmh/` に同梱されている。仕様に対応するエージェントの skills ディレクトリへ symlink して使う (取り込みパスはエージェントごとのドキュメントを参照)。

## プランと課金

| Plan | 価格 | persistent 上限 |
|---|---|---|
| Anonymous (未ログイン) | $0 | 0 |
| Free | $0 | 0 |
| Metered | $0 base + $0.60/mo per peak persistent webhook | 10 |

- `ohmh create` で作る persistent webhook は **Metered プランの peak 課金対象**。1 か月の同時保持数の最大値 × $0.60 が請求される
- 短期テストは **匿名 / ephemeral (`npx ohmh --port <n>`) で済ませる** のが推奨。これは課金対象外
- AI agent が persistent を作る場合は `trap 'ohmh delete "$ID" --yes' EXIT` で必ず掃除する。詳細は `skills/ohmh/references/BILLING.md`

## 設定

- Access token は XDG 準拠で `$XDG_CONFIG_HOME/ohmh/credentials.json` (デフォルト `~/.config/ohmh/credentials.json`) に `chmod 0600` で保存される。
- `OH_MY_HOOKS_BASE_URL` でセルフホスト or ローカル開発用サーバへ向けることができる。

## 開発

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (cli + ../shared を一括実行)
npm run build         # tsup -> dist/ohmh.js
npm run dev           # tsup --watch
```

## License

MIT — see [LICENSE](./LICENSE).
