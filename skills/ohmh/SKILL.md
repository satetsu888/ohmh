---
name: ohmh
description: "TRIGGER when the user wants to receive a real webhook on their local machine, expose localhost over a temporary public URL, debug a webhook delivered by Stripe/GitHub/Shopify/etc. without setting up a tunnel, or replay a past webhook against a local port. Uses the `ohmh` CLI (npx ohmh) which forwards from ohmh.satetsu888.dev to a local port over WebSocket."
license: MIT
compatibility: "Requires Node.js 20+ (for `npx ohmh`), a POSIX shell, jq, and network access to ohmh.satetsu888.dev. Works with any agent that can launch a long-running subprocess and read its stdout."
metadata:
  author: satetsu888
  version: "0.1"
  cli-version: ">=0.1.0"
---

# ohmh

`ohmh` is a CLI that gives a local port a public webhook URL by forwarding traffic from `ohmh.satetsu888.dev` over a WebSocket. Use it when an external service (Stripe, GitHub, Shopify, etc.) needs to deliver a webhook to a developer machine, or when the user wants to replay a past webhook against a local port.

There are three modes, in increasing order of commitment:

- **anonymous** — no sign-in. The webhook is deleted server-side the moment the WebSocket disconnects. Free.
- **ephemeral** — signed in. Created on subscribe, removed on unsubscribe (24h TTL is a safety net). Free.
- **persistent** — signed in. Indefinite lifetime, created with `ohmh create`, listed by `ohmh list`. **Billed** under the Metered plan ($0.60/mo per peak persistent webhook). See `references/BILLING.md`.

## Modes (decision tree)

```
Want to receive a webhook locally?
├─ Just check it works once             → npx ohmh --port <n>
│   anonymous + ephemeral. Server deletes it on disconnect. Not billed.
├─ Already signed in, throwaway test    → ohmh --port <n>
│   authed ephemeral. 24h TTL. Available even on Free. Not billed.
├─ Need a stable URL across sessions    → ohmh login → ohmh create
│                                         → ohmh --port <n> --id <id>
│   persistent. Billed under Metered ($0.60/mo per peak).
│   Read references/BILLING.md before creating one.
└─ Replay a past webhook locally        → ohmh resend <id> <reqId> --port <n>
```

## Background-process patterns

`ohmh` (default subcommand `connect`) is a long-running process — it exits only on SIGINT/SIGTERM. Pick one of the three patterns below depending on what your runtime can do. All three use line-buffered NDJSON on stdout (`--json` mode).

### A. Stream-and-filter

Lowest latency. Use this if the runtime can launch a subprocess and stream its stdout into the agent context. Filter with `grep --line-buffered` so the unbuffered output reaches the consumer immediately:

```bash
npx ohmh --port 3000 --json | grep --line-buffered -E '"type":"(ready|request|error)"'
```

`--line-buffered` is mandatory — without it, pipe block-buffering can delay events by minutes.

### B. Done-file polling (`--ready-file`)

Works with any runtime that can run shell. The CLI touches a file (mode `0600`) the moment the URL is ready, and removes it on graceful shutdown. The file's content is a single JSON line `{"url", "webhookId", "mode"}`:

```bash
npx ohmh --port 3000 --json --ready-file /tmp/ohmh.ready \
  > /tmp/ohmh.ndjson 2> /tmp/ohmh.log &
PID=$!
trap 'kill "$PID" 2>/dev/null' EXIT INT TERM

until [ -f /tmp/ohmh.ready ]; do sleep 0.1; done
URL=$(jq -r .url /tmp/ohmh.ready)
```

### C. NDJSON file polling

Fallback when neither stdout streaming nor `--ready-file` fits. Redirect stdout to a file, poll for the `ready` event:

```bash
npx ohmh --port 3000 --json > /tmp/ohmh.ndjson 2> /tmp/ohmh.log &
PID=$!
trap 'kill "$PID" 2>/dev/null' EXIT INT TERM

until grep -q '"type":"ready"' /tmp/ohmh.ndjson; do sleep 0.2; done
URL=$(jq -r 'select(.type=="ready") | .url' /tmp/ohmh.ndjson | head -1)
```

## Minimal end-to-end example

Anonymous + ephemeral, wait for one webhook to arrive, then exit. **Not billed.** This uses Pattern A, but you can swap in B or C if needed:

```bash
npx ohmh --port 3000 --json \
  | grep --line-buffered -E '"type":"(ready|request|error)"' &
PID=$!
trap 'kill "$PID" 2>/dev/null' EXIT INT TERM

# (use the URL from the `ready` line that appears on stdout —
#  e.g. configure a service to send a test webhook to it,
#  or run `curl $URL` from elsewhere)

# wait for the runtime to surface a `request` line, then stop ohmh.
```

## Cleanup pattern (when creating persistent webhooks)

Persistent webhooks are billed by peak count per period (see `references/BILLING.md`). **Always wrap creation in a `trap` that deletes the webhook on exit**, otherwise an interrupted run leaves the webhook (and the charge) behind:

```bash
ID=$(ohmh --json create | jq -r '.webhook.id')
trap 'ohmh delete "$ID" --yes' EXIT INT TERM

ohmh --port 3000 --id "$ID" --json \
  | grep --line-buffered -E '"type":"(ready|request|error)"'
```

For variants (e.g. combined with file polling, or reusing an existing persistent webhook to avoid the charge entirely), see `references/RECIPES.md`.

## JSON event reference (main events)

`--json` mode emits one JSON object per line on stdout. Human-readable prose moves to stderr. Main events:

| `type` | When | Key fields |
|---|---|---|
| `ready` | once, when WS is up and the webhook id is known | `mode` (`anonymous`/`ephemeral`/`persistent`), `webhookId`, `url`, `forwardPort` |
| `request` (from `connect`) | for each forwarded webhook arrival | `ts`, `method`, `path`, `status` (number\|null), `durationMs`, `error?`, `webhookId`, `sourceRequestId` |
| `error` | once before non-zero exit | `code`, `exitCode`, `message`, `name`, optional: `kind`, `reason`, `webhookLimit`, `status` |
| `login_url` | from `ohmh login --json`, before opening the browser | `url`, `redirectUri` |

The full schema for every event (including `list`, `create`, `delete`, `whoami`, `requests`, `request <id> <reqId>`, `resend`, `logout`) is in `references/REFERENCE.md`. Or run `ohmh schema` to get a JSON Schema (Draft 2020-12) on stdout.

**Forward compatibility**: NDJSON consumers should ignore unknown `type` values and unknown fields.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | general error |
| 2 | authentication required (run `ohmh login`) |
| 3 | plan limit reached (see `references/BILLING.md`) |
| 4 | webhook or request not found |
| 5 | invalid input (e.g. bad port) |

## Plans and billing (summary)

- Anonymous and ephemeral webhooks are free. Use them for one-off testing.
- **Persistent webhooks are billed** under the Metered plan ($0.60/mo per peak persistent webhook within a billing period). The peak is the maximum count held simultaneously during the period — it does not decrease when a webhook is deleted within the same period.
- Default behavior: do not call `ohmh create` unless the user explicitly asks for a persistent webhook. If you do create one, use the Cleanup pattern above and confirm with the user before leaving it behind.

Full details, the `402` failure modes, and how to view the running estimated charge with `ohmh whoami` are in `references/BILLING.md`.

## Pitfalls

- `connect` is long-running. Always run it in the background (subprocess / `&` / equivalent) — running it in the foreground will hang the session.
- `ohmh delete` requires `--yes` in non-TTY environments. Without a TTY the confirmation defaults to "no" and the command errors out.
- `ohmh login` opens a browser. It cannot complete in headless environments — surface the `login_url` event to the user instead.
- The webhook URL is only known after the `ready` event (or after `--ready-file` is written). Don't try to use it before then.
- For `ohmh request <id> <reqId>`, always pass `--json`. The human-mode output splits headers (stderr) from body (stdout) which is hard to parse reliably.
- Don't leave persistent webhooks running after a task — they incur charges. Use the Cleanup pattern.
- When tailing stdout, filter with `grep --line-buffered '"type":"…"'` to keep unrelated lines out of the agent's context.
- Two events share `type: "request"`: the per-arrival event from `connect` (flat fields) and the detail event from `ohmh request <id> <reqId>` (nested under `request`). Distinguish by which command was invoked.
- Token is stored at `~/.config/ohmh/credentials.json` (mode `0600`). Removing the file is equivalent to `ohmh logout`.

## Before reporting success

Run through this checklist before telling the user the task is done:

1. Did a `ready` event (or the `--ready-file`) appear, confirming the webhook URL?
2. If the task was to receive a webhook, did at least one `request` event arrive?
3. Was the background `ohmh` process killed at the end?
4. If you created a persistent webhook, did you delete it (or confirm with the user that it should remain)?

## More references

- Full event schema, env vars, token storage: `references/REFERENCE.md`
- Recipes beyond the basic flow (history, resend, end-to-end with external services, CI assertions, reusing an existing persistent webhook): `references/RECIPES.md`
- Billing details, peak mechanics, `402` handling: `references/BILLING.md`
- Programmatic schema (JSON Schema Draft 2020-12): `ohmh schema`
