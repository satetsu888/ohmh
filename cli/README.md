# ohmh

[日本語版 / Japanese](./README.ja.md)

CLI client for [Oh My Hooks](https://ohmh.satetsu888.dev). Receive webhooks at a unique URL and forward them to a local port without installing anything globally.

## Quick start

```bash
# Forward webhooks to localhost:3000 with an ephemeral URL (no login required)
npx ohmh --port 3000
```

The first connection uses an anonymous ephemeral webhook — great for one-off testing. Run `ohmh login` to use a persistent URL tied to your account.

## Commands

| Command | Description |
|---|---|
| `ohmh [--port <port>] [--id <id>] [--anonymous] [--ready-file <path>]` | (default) Shortcut for `connect`. Use `npx ohmh --port 3000` with no subcommand. |
| `ohmh connect [--port <port>] [--id <id>] [--anonymous] [--ready-file <path>]` | Subscribe to a webhook and forward requests to a local port. When `--id` is omitted, an ephemeral webhook is created — anonymous when logged out, authenticated ephemeral when logged in. `--ready-file` writes a single JSON line (`url` / `webhookId` / `mode`) to the given path once the connection is ready. |
| `ohmh login` | Open the browser, sign in via OAuth (PKCE), and store the access token. |
| `ohmh logout` | Discard the stored access token. |
| `ohmh whoami` | Show the signed-in user and plan (and current peak / estimated charge on the Metered plan). |
| `ohmh list` | List your persistent webhooks. |
| `ohmh create` | Create a persistent webhook. |
| `ohmh delete <id> [--yes]` | Delete a webhook. |
| `ohmh requests <id> [--limit <n>] [--offset <n>]` | Show a persistent webhook's request history (default limit = 20). |
| `ohmh request <id> <reqId>` | Show all headers and body of a single request. |
| `ohmh resend <id> <reqId> --port <port>` | Resend a past request to a local port (no server round-trip). |
| `ohmh schema` | Print the JSON Schema (Draft 2020-12) of NDJSON events to stdout. |

The following global options are available on every command:

- `--base-url <url>` (env: `OH_MY_HOOKS_BASE_URL`) — Override the API base URL (default: `https://ohmh.satetsu888.dev`).
- `--json` — Switch to NDJSON machine-readable output.
- `-q, --quiet` — Suppress info-level output.
- `-v, --verbose` — Enable debug output.

Run `ohmh <command> --help` for per-command details.

## Exit codes

| Code | Meaning | Typical case |
|---|---|---|
| 0 | Success | |
| 1 | Generic error | Unexpected exception |
| 2 | Auth error | Not logged in / OAuth state mismatch |
| 3 | Plan limit reached | `create` hits Free=0 / Metered=10 |
| 4 | Not found | Webhook / request id does not exist |
| 5 | Invalid input | Port out of range, required flag missing |

## JSON event reference

With `--json`, NDJSON is written to stdout (human-readable prose moves to stderr). One line = one event. Main events:

| Subcommand | type | Key fields |
|---|---|---|
| `connect` | `ready` | `mode` (`anonymous` / `ephemeral` / `persistent`), `webhookId`, `url`, `forwardPort` |
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

NDJSON consumers **must ignore unknown `type` values** so that future event additions don't break them. See `skills/ohmh/references/REFERENCE.md` for full details.

## Use from AI agents

Minimal guide for invocation from an AI agent:

- `connect` (default) is a **long-running process**. It blocks until SIGINT, so launch it in the background.
- Always pass `--json` (stdout becomes NDJSON, stderr stays prose — much easier to parse).
- `delete` requires `--yes` (without a TTY, the confirm prompt defaults to false → cancelled).
- `login` requires a browser, so it cannot run headless.

Three startup patterns:

```bash
# (A) Stream-and-filter — when the agent supports stdout streaming
npx ohmh --port 3000 --json | grep --line-buffered -E '"type":"(ready|request|error)"'

# (B) Done-file polling — receive the "ready" moment as a file touch via --ready-file
npx ohmh --port 3000 --json --ready-file /tmp/ohmh.ready > /tmp/ohmh.ndjson &
until [ -f /tmp/ohmh.ready ]; do sleep 0.1; done
URL=$(jq -r .url /tmp/ohmh.ready)

# (C) NDJSON file polling — fallback
npx ohmh --port 3000 --json > /tmp/ohmh.ndjson 2>/tmp/ohmh.log &
until grep -q '"type":"ready"' /tmp/ohmh.ndjson; do sleep 0.2; done
URL=$(jq -r 'select(.type=="ready") | .url' /tmp/ohmh.ndjson | head -1)
```

For a machine-readable JSON Schema (Draft 2020-12) of the events, use `ohmh schema | jq`.

A skill conforming to the [Agent Skills specification](https://agentskills.io/specification) is bundled at `skills/ohmh/`. Symlink it into the skills directory of any spec-compliant agent (consult each agent's docs for the exact ingestion path).

## Plans & billing

| Plan | Price | Persistent limit |
|---|---|---|
| Anonymous (logged out) | $0 | 0 |
| Free | $0 | 0 |
| Metered | $0 base + $0.60/mo per peak persistent webhook | 10 |

- Persistent webhooks created with `ohmh create` are **billable on the Metered plan via peak count**. The monthly maximum of concurrently held webhooks × $0.60 is charged.
- For short-lived testing, **prefer anonymous / ephemeral (`npx ohmh --port <n>`)** — these are not billed.
- When an AI agent creates a persistent webhook, always clean up via `trap 'ohmh delete "$ID" --yes' EXIT`. See `skills/ohmh/references/BILLING.md`.

## Configuration

- The access token is stored in XDG-compliant `$XDG_CONFIG_HOME/ohmh/credentials.json` (default `~/.config/ohmh/credentials.json`) with `chmod 0600`.
- `OH_MY_HOOKS_BASE_URL` lets you point at a self-hosted or local-development server.

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest (runs cli + ../shared together)
npm run build         # tsup -> dist/ohmh.js
npm run dev           # tsup --watch
```

## License

MIT — see [LICENSE](./LICENSE).
