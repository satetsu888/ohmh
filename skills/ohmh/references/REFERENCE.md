# ohmh CLI reference

Detailed reference complementing `SKILL.md`. Sections:

- [JSON event reference](#json-event-reference) — every NDJSON event the CLI can emit on stdout in `--json` mode
- [Exit codes](#exit-codes) — all six values
- [Webhook ID and URL format](#webhook-id-and-url-format)
- [Environment variables](#environment-variables)
- [Token storage](#token-storage)
- [Forward compatibility](#forward-compatibility)

---

## JSON event reference

With `--json`, stdout becomes **NDJSON** (one JSON object per line). Human-readable prose moves to stderr.

> **Tip**: `ohmh schema` prints a JSON Schema (Draft 2020-12) for every event below, suitable for validators and code generators.

### `connect` (default subcommand) — long-running

| `type` | When | Fields |
|---|---|---|
| `ready` | exactly once, when WS is up and the webhook id is known | `mode` (`"anonymous"` \| `"ephemeral"` \| `"persistent"`), `webhookId` (string), `url` (string, e.g. `https://ohmh_xxx.satetsu888.dev/`), `forwardPort` (integer 1-65535) |
| `request` | once per webhook arrival (= once per forward attempt) | `ts` (ISO 8601), `sourceRequestId` (string), `webhookId` (string), `method` (string), `path` (string), `status` (integer \| null; null means upstream error), `durationMs` (number), `error` (string \| undefined) |
| `error` | once before non-zero exit | `code`, `exitCode`, `message`, `name`, optional: `kind`, `reason`, `webhookLimit`, `status` |

> **Note**: the `request` event from `connect` (flat fields) is distinct from the `request` event from `ohmh request <id> <reqId>` (nested under a `request` field). Distinguish by which command was invoked.

### `login`

| `type` | Fields |
|---|---|
| `login_url` | `url` (authorize URL), `redirectUri` (loopback) — emitted before opening the browser |
| `login` | `baseUrl`, `name` (string \| null), `email` (string \| null), `plan` (string \| null) — emitted after a successful sign-in |

### `logout`

| `type` | Fields |
|---|---|
| `logout` | `baseUrl` |

### `whoami`

| `type` | Fields |
|---|---|
| `whoami` | `id`, `name`, `email`, `image` (string \| null), `plan: { key, name, limits: { ephemeral, persistent, requestsPerDay, historyDays } }`, `currentPeakPersistent?` (number), `estimatedUsageChargeCents?` (number) |

`currentPeakPersistent` and `estimatedUsageChargeCents` are present only when the account is on the Metered plan with an active billing period. See `references/BILLING.md` for the meaning.

### `list`

| `type` | Fields |
|---|---|
| `list` | `webhooks: Webhook[]` where each `Webhook` has `id`, `enabled`, `destinationUrls?`, `expiresAt?` (string \| null), `createdAt?` |

`expiresAt` non-null indicates an ephemeral webhook; null/undefined indicates a persistent webhook.

### `create`

| `type` | Fields |
|---|---|
| `create` | `webhook: Webhook` |

On 402 (limit reached), an `error` event is emitted instead with:

```jsonc
{
  "type": "error",
  "code": "plan_limit_upgradable" | "plan_limit_top",
  "exitCode": 3,
  "kind": "persistent",
  "webhookLimit": 0 | 10,
  "status": 402,
  "message": "..."
}
```

See `references/BILLING.md` for handling each case.

### `delete`

| `type` | Fields |
|---|---|
| `delete` | `webhookId`, `deleted: true` |

If the webhook is not found, the command exits 4 (NOT_FOUND).

### `requests` (history list)

| `type` | Fields |
|---|---|
| `requests` | `webhookId`, `requests: WebhookSourceRequest[]` |

Each `WebhookSourceRequest` has `id`, `webhookId`, `method`, `url`, `createdAt`, `headers: Record<string, string>`, `body: string \| null`.

### `request <id> <reqId>` (single, full detail)

| `type` | Fields |
|---|---|
| `request` | `request: WebhookSourceRequest` |

### `resend`

| `type` | Fields |
|---|---|
| `resend` | `webhookId`, `requestId`, `port`, `status` (integer \| null), `durationMs`, `error` (string \| undefined) |

There is no server round-trip — the CLI's local forwarder replays the stored request directly to the chosen port, so the server has no record of a resend.

---

## Exit codes

| Code | Constant | Meaning | Typical cause |
|---|---|---|---|
| 0 | `EXIT_OK` | success | |
| 1 | `EXIT_GENERAL_ERROR` | general error | unhandled exception, 5xx from API |
| 2 | `EXIT_AUTH_ERROR` | authentication error | not signed in, OAuth state mismatch |
| 3 | `EXIT_PLAN_LIMIT` | plan limit reached | `create` got 402 |
| 4 | `EXIT_NOT_FOUND` | not found | webhook or request id does not exist |
| 5 | `EXIT_BAD_INPUT` | invalid input | port out of range (1-65535), missing required flag |

Branching example:

```bash
ohmh --json list > /dev/null
case $? in
  0) ;;                            # ok
  2) echo "needs login"; exit 1 ;;
  *) echo "unexpected error"; exit 1 ;;
esac
```

---

## Webhook ID and URL format

Webhook IDs are prefixed `ohmh_`. The webhook URL is formed by replacing the leading subdomain of the base host with the id:

- Base: `https://ohmh.satetsu888.dev/`
- Webhook (`ohmh_abc`): `https://ohmh_abc.satetsu888.dev/`

For development hosts without a subdomain (e.g. `http://localhost:8787/`), the id is prepended: `http://ohmh_abc.localhost:8787/`.

The CLI computes the URL from whichever base URL it is using, so `--base-url` automatically affects the URLs reported in `ready` events.

---

## Environment variables

| Name | Effect | Default |
|---|---|---|
| `OH_MY_HOOKS_BASE_URL` | Override the API/web base URL | `https://ohmh.satetsu888.dev` |
| `XDG_CONFIG_HOME` | Directory for `credentials.json` (Linux/macOS) | `$HOME/.config` |
| `APPDATA` | Directory for `credentials.json` (Windows) | `%USERPROFILE%\AppData\Roaming` |

The `--base-url <url>` flag takes precedence over `OH_MY_HOOKS_BASE_URL`. Each base URL is keyed independently in the credential store, so staging and production tokens do not collide.

---

## Token storage

- macOS / Linux: `$XDG_CONFIG_HOME/ohmh/credentials.json` (default `~/.config/ohmh/credentials.json`)
- Windows: `%APPDATA%\ohmh\credentials.json`
- File mode: `0600`
- Removing the file is equivalent to `ohmh logout`
- Internal format: `{ "<base-url>:token": "<access-token>", ... }` (multiple base URLs may coexist)

---

## Forward compatibility

NDJSON consumers (jq scripts, agent runtimes, validators) **must ignore unknown `type` values and unknown fields**. New event types and optional fields may be added without a major version change, and consumers that fail closed on unknown shapes will break unnecessarily.

Breaking changes will be signaled by a `cli-version` bump in the skill's frontmatter and announced separately.
