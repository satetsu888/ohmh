# ohmh

CLI client for [Oh My Hooks](https://oh-my-hooks.com). Receive webhooks at a unique URL and forward them to a local port without installing anything globally.

## Quick start

```bash
# Forward webhooks to localhost:3000 with an ephemeral URL (no login required)
npx ohmh --port 3000
```

The first connection uses an anonymous ephemeral webhook — great for one-off testing. Run `ohmh login` to use a persistent or custom-subdomain URL tied to your account.

## Commands

| Command | Description |
|---|---|
| `ohmh [--port <port>] [--id <webhookId>] [--anonymous]` | (default) `connect` のショートカット。引数なしで `npx ohmh --port 3000` のように使える |
| `ohmh connect [--port <port>] [--id <id>] [--anonymous]` | webhook を購読してローカルポートへ転送する。`--id` 省略時は ephemeral を作成、未ログインなら anonymous、ログイン済なら authenticated ephemeral |
| `ohmh login` | ブラウザを開いて OAuth (PKCE) でサインイン、access token を保存する |
| `ohmh logout` | 保存された access token を破棄する |
| `ohmh whoami` | サインイン中のユーザーとプランを表示 |
| `ohmh list` | 自分の webhook (persistent / custom URL) を一覧表示 |
| `ohmh create [--persistent] [--custom <subdomain>]` | webhook を作成する。`--custom` は Pro プラン限定 |
| `ohmh delete <id> [--yes]` | webhook を削除する |
| `ohmh requests <id> [--limit <n>] [--offset <n>]` | persistent webhook の受信履歴を表示する (default limit=20) |
| `ohmh request <id> <reqId>` | 1 件のリクエストの全 headers / body を表示する |
| `ohmh resend <id> <reqId> --port <port>` | 過去のリクエストをローカルポートへ再送する (サーバ往復なし) |

すべてのコマンドで以下のグローバルオプションが使える:

- `--base-url <url>` (env: `OH_MY_HOOKS_BASE_URL`) — API ベース URL を上書き (デフォルト `https://oh-my-hooks.com`)
- `--json` — NDJSON 形式の機械可読出力に切り替える
- `-q, --quiet` — info レベルの出力を抑制
- `-v, --verbose` — debug 出力を有効化

`ohmh <command> --help` で各コマンドの詳細を確認できる。

## Configuration

- Access token は XDG 準拠で `$XDG_CONFIG_HOME/ohmh/credentials.json` (デフォルト `~/.config/ohmh/credentials.json`) に `chmod 0600` で保存される。
- `OH_MY_HOOKS_BASE_URL` でセルフホスト or ローカル開発用サーバへ向けることができる。

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (cli + ../shared を一括実行)
npm run build         # tsup -> dist/ohmh.js
npm run dev           # tsup --watch
```

## License

MIT — see [LICENSE](../LICENSE).
