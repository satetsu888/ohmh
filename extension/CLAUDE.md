# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oh My Hooks is a VS Code extension that integrates with the Oh My Hooks web service, allowing developers to manage webhooks and forward requests directly from VS Code to local development servers.

## Tech Stack

- **Extension Framework**: VS Code Extension API
- **UI**: React-based webview
- **Build System**: Webpack (multi-target builds)
- **Language**: TypeScript
- **Realtime**: WebSocket client (Cloudflare Durable Object on the server)
- **Authentication**: OAuth2 via VS Code authentication provider

## Development Commands

```bash
# Install dependencies
npm install

# Compile extension and webview
npm run compile

# Watch mode for development
npm run watch

# Run linter
npm run lint

# Package for production
npm run package
```

## Architecture

### Multi-Component Build Structure

The extension consists of two webpack builds:
1. **Extension Core** (`/core/src/extension.ts`): Node.js context, VS Code API integration
2. **Webview UI** (`/webview/src/index.tsx`): React-based web context for the panel UI

### Source Layout (`extension/core/src/`)

- `vscode/` — VS Code 依存ゾーン
  - `secretStorageImpl.ts`: `vscode.SecretStorage` ラッパ (`SecretStore` の VS Code 実装)
- `lib/`: VS Code 統合 (Authentication / Webview Provider)
- `extension.ts`, `stateStore.ts`, `api.ts`, `messages.ts`, `util.ts`, `env.d.ts`

VS Code API 非依存の共有モジュール (`protocol.ts`, `wsClient.ts`, `forwarder.ts`, `secretStore.ts`, `auth/pkce.ts`) は **`ohmh/shared/`** に置かれており、ここから `../../../shared/...` で import する。CLI と共有しているため、`vscode` の import は `ohmh/shared/eslint.config.mjs` の `no-restricted-imports` で禁止されている (extension 側 ESLint ではなく shared 側で機械的に担保)。

> サーバ側の WS protocol 定義は別リポジトリの `app/lib/ws_protocol.ts`。`ohmh/shared/protocol.ts` と内容を一致させる必要がある (手動同期)。

### Key Components

1. **OhMyHooksAuthenticationProvider** (`/core/src/lib/OhMyHooksAuthenticationProvider.ts`)
   - Handles OAuth2 authentication flow with the Oh My Hooks service
   - Manages VS Code authentication sessions

2. **OhMyHooksWebViewProvider** (`/core/src/lib/OhMyHooksWebViewProvider.ts`)
   - Creates and manages the webview panel
   - Handles message passing between extension and webview

3. **StateStore** (`/core/src/stateStore.ts`)
   - Manages extension state and webhook connections
   - Handles API communication with the Oh My Hooks service

4. **WSClient** (`ohmh/shared/wsClient.ts`)
   - Persistent WebSocket connection to the Cloudflare Durable Object
   - Handles subscribe / unsubscribe / reconnect (no response side; the protocol is server → client only)

### Message Flow

1. **Extension ↔ Webview Communication**
   - Messages defined in `/core/src/messages.ts` and `/webview/src/messages.ts`
   - Bidirectional communication via `postMessage` API

2. **Webhook Request Flow** (one-way WS)
   - Webhook received by Oh My Hooks service → written to D1 + R2 (skipped for ephemeral / anon)
   - Server fans out to subscribed sessions via `SessionNotifierDO.fetch('/notify', ...)`
   - DO sends WS `request` message to connected client (extension)
   - Extension immediately pushes `webhookRequestReceived` to the webview so the row shows up
   - Extension `forwarder.forward()` posts to `http://localhost:<port>`; the result (status / error / durationMs) is pushed to the webview as `webhookForwardResult`
   - Server is not informed of the forward result (no `response` message exists)

### Key Message Types

- `initialLoad`: Load initial state when webview opens
- `signIn`: Trigger authentication flow
- `connect`: Connect a webhook to a local port
- `disconnect`: Disconnect a webhook from local port
- `statusChanged`: Update UI with new state

### Webhook Kinds (kind awareness in the extension)

The server defines two webhook kinds (see project root `/CLAUDE.md`): **ephemeral** (session-scoped, no server-side storage) and **persistent** (indefinite, full storage). Per-plan slot counts are enforced server-side.

#### Ephemeral webhook (placeholder + Connect on demand)

The webhook list always shows a single **ephemeral placeholder** entry at the top (set via `stateStore.buildEphemeralPlaceholder` after sign-in). It has `id: ""` until connected. On Connect, the extension calls `wsClient.subscribeEphemeral()`; the server replies with `ephemeralWebhookCreated` carrying a fresh id, which `stateStore.setEphemeralWebhookId` writes back into the placeholder. On Disconnect, the extension sends `unsubscribeEphemeral(id)`; the server deletes the webhook from D1 + R2 and the placeholder id is cleared. WS reconnect re-issues a new ephemeral id via `ephemeralPending` in `WSClient`.

**Ephemeral webhooks are never created via REST** — `POST /api/webhooks { type: "ephemeral" }` returns 400. The list endpoint also filters them out so other VS Code windows do not see each other's ephemerals.

#### Persistent webhook creation

`oh-my-hooks.createWebhook` (command palette) creates a persistent webhook directly via `POST /api/webhooks { type: 'persistent' }`. 402 responses (with `kind` in the body) are surfaced as plan-limit messages.

#### Webhook list kind badge

Each row renders a kind badge (Ephemeral / Persistent) via `WebhookKindBadge`, derived from `expiresAt`.

### Anonymous Webhooks

Command `oh-my-hooks.createAnonymousWebhook` opens a separate `WSClient` with `anonymous: true` (no sign-in required). The client connects with subprotocol `anonymous`, sends `subscribeAnonymous`, and receives `anonymousWebhookCreated` carrying the new webhook id. The webhook is always **ephemeral** kind (24h server-side TTL as a safety net), but in practice it lives only as long as that WS connection — closing it (or the extension) deletes the webhook on the server. The user is asked for a local port up-front; forwarding uses the same `forward()` helper as the authenticated path. There is no history / list view for anonymous webhooks (no server-side storage by definition).

## Important Considerations

1. **Realtime Channel**: The extension uses a WebSocket connection (`ohmh/shared/wsClient.ts`) to a per-session Cloudflare Durable Object. `session_id` is generated fresh on each `activate()` (not persisted), so multiple windows / restarts get separate subscriptions.

2. **Authentication Flow**: The extension implements a custom OAuth2 (PKCE) authentication provider. The access token is sent over WebSocket via the `Sec-WebSocket-Protocol: bearer.<token>` subprotocol (browser WebSocket cannot set custom headers).

3. **Webview Security**: The webview runs in a sandboxed environment. All communication must go through the message passing API.

4. **Resource Cleanup**: `StateStore` and the `WSClient` both implement disposable patterns. The WS connection is closed on extension deactivate.

5. **Error Handling**: Network requests and the WebSocket should surface errors via `vscode.window.showErrorMessage`.

6. **shared/ boundary**: `ohmh/shared/` (top-level, **not** under `core/src/`) must remain free of `vscode` imports — enforced by `no-restricted-imports` in `ohmh/shared/eslint.config.mjs`. CLI と extension が同じコードを再利用するための boundary。