# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oh My Hooks のクライアント実装群を管理するリポジトリ。Web サービス本体 (`https://ohmh.satetsu888.dev`) のサーバ側コードは別 (private) リポジトリで管理される。

提供するクライアントは 2 つ:

1. **CLI** (`/cli`): `npx ohmh --port 3000` で webhook を受け取り、ローカルポートへ転送する Node.js CLI
2. **VS Code Extension** (`/extension`): VS Code 内から webhook 管理 + ローカル転送を行う拡張

両者は `/shared` の protocol / wsClient / forwarder / secretStore を共有する。

## Repository Structure

```
ohmh/
├── cli/                     # Node.js CLI (ohmh) - tsup でシングル CJS にビルド
├── extension/               # VS Code 拡張
│   ├── core/                # 拡張本体 (Node.js)
│   └── webview/             # webview UI (React)
├── shared/                  # client 間で共有するモジュール (vscode 非依存)
│   ├── protocol.ts          # WS protocol types
│   ├── wsClient.ts          # WebSocket client (再接続)
│   ├── forwarder.ts         # localhost への HTTP 転送
│   ├── secretStore.ts       # SecretStore interface
│   └── auth/pkce.ts         # PKCE (S256, base64url) ペア / state 生成
└── skills/                  # AI エージェント向け Agent Skills
    └── ohmh/                # ohmh CLI を AI から使うための skill (Claude Code / Codex CLI 等で利用)
```

> `shared/protocol.ts` はサーバ側の protocol 定義と内容を一致させる必要がある。サーバ実装は別リポジトリにあり、当面は手作業同期で運用する。
>
> `skills/ohmh/` は [Agent Skills 公式仕様](https://agentskills.io/specification) 準拠。primary verified targets は Claude Code と Codex CLI。skill 本体は `skills/ohmh/SKILL.md`。

## Development Commands

### CLI (`/cli`)

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest (cli + shared を一括実行)
npm run build        # tsup -> dist/ohmh.js
npm run dev          # tsup --watch
```

### VS Code Extension (`/extension`)

```bash
npm install
npm run compile      # webpack で extension + webview をビルド
npm run watch        # ウォッチモード
npm run lint
npm run test
npm run package      # 配布用 .vsix を生成
```

## Architecture Overview

詳細はサブディレクトリの CLAUDE.md (`extension/CLAUDE.md`) を参照。両者で共通する事柄をここに集約する。

### WS Protocol (one-way)

- server → client の `request` メッセージのみ。client は forward 結果を server に echo しない (`response` メッセージは存在しない)
- 認証は `Sec-WebSocket-Protocol: bearer.<token>` の subprotocol で渡す (browser WebSocket がカスタムヘッダを送れないため)
- anonymous モードは `Sec-WebSocket-Protocol: anonymous` で接続
- token 期限切れ時は接続時に 401 が返る (refresh token 機構は未実装。失効通知の push もしない)

### OAuth + PKCE

- Authorization Code Flow + PKCE (S256)
- 実装は `shared/auth/pkce.ts` に集約 (CLI / Extension / サーバ `verifyPKCE` で同じ encoding を使う)
- `code_verifier` は `randomBytes(32).toString("base64url")` で生成
- `code_challenge` は `createHash("sha256").update(verifier).digest("base64url")` (RFC 7636 §4.2 準拠で base64url、padding なし)
- Extension は VS Code authentication API を、CLI は localhost loopback (port 53682-53690) を使う

### Token Storage (`SecretStore` interface)

- Extension: `vscode.SecretStorage` のラッパ (`extension/core/src/vscode/secretStorageImpl.ts`)
- CLI: XDG `~/.config/ohmh/credentials.json` に chmod 0600 (`cli/src/store/fileSecretStore.ts`)
- 両者は `shared/secretStore.ts` の `SecretStore` interface を実装する

### `shared/` boundary

`shared/` 配下は `vscode` を import してはならない (`shared/eslint.config.mjs` の `no-restricted-imports` で機械的に担保)。これにより CLI と Extension が共通利用できる状態を維持する。

## Webhook Kinds (client 視点)

| Kind | 寿命 | 作成方法 | 履歴 |
|---|---|---|---|
| **ephemeral** | WS セッションに紐付き、disconnect / unsubscribe で消える (24h TTL は保険) | WS `subscribeEphemeral` (authed) / `subscribeAnonymous` (anon) | なし |
| **persistent** | 無期限 | REST `POST /api/webhooks { type: "persistent" }` | あり (resend 可能) |

ephemeral は REST では作成できず (400 + `reason: "ephemeral_via_ws_only"`)、必ず WS 経由で作成される。

## Subscription Tiers (UI 表示用の参照値)

| Plan | Price | ephemeral | persistent | requests/day |
|---|---|---|---|---|
| Anonymous | $0 | 1 | 0 | 100 |
| Free | $0 | 1 | 0 | 100 |
| Metered | $0 base + $0.60/peak persistent/mo | 1 | 10 | 500 |

> 真の source of truth はサーバ側 (`app/lib/subscription.server.ts`) のため、ここの数値はあくまで client UI 表示用の参考値。乖離していたらサーバを信頼する。

## Important Patterns

1. **Session Management**: token は `SecretStore` に保存する。サーバ側で 401 を返された場合は再 login を促す (現状は refresh token 機構なし)
2. **Error Handling**: ユーザーに可読なメッセージで返す。CLI は exit code を `cli/src/errors.ts` の定数で統一
3. **Resource Cleanup**: `WSClient` / forwarder は Disposable として扱い、確実に破棄する
4. **shared/ の依存方向**: shared は vscode を知らない。extension / cli から shared への片方向参照のみ許可
5. **One-way WS**: forward 結果をサーバに返さない前提でコードを書く (失敗は client 側のログ / UI のみで扱う)

## Testing

### CLI (Vitest)

- `cli/src/**/*.test.ts` および `shared/**/*.test.ts` を `cli/vitest.config.ts` 経由で実行
- `pool: "forks"` でテスト並列化
- 主なカバレッジ: api / config / pkce / fileSecretStore / format / forwarder / wsClient

### Extension (VS Code Test)

- VS Code test framework
- TypeScript strict mode
- Disposable パターンに沿ったリソース解放
