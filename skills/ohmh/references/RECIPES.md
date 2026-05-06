# ohmh recipes

Recipes that go beyond the basic flow in `SKILL.md`. The three core background-process patterns (Stream-and-filter, Done-file polling, NDJSON file polling) and the basic `trap` cleanup pattern live in `SKILL.md` and are not repeated here.

When a recipe needs a running `ohmh` process, this file refers to "Pattern A/B/C from SKILL.md" instead of inlining the same snippets.

---

## Read past requests for a persistent webhook

A persistent webhook stores its incoming request history (subject to the plan's history retention). Use the `--json` pipeline to navigate from list to detail:

```bash
# List your persistent webhooks (filters out ephemeral entries).
ohmh --json list \
  | jq '.webhooks[] | select(.expiresAt == null) | {id, createdAt}'

# Recent requests for a specific webhook (default limit is 20).
WEBHOOK_ID=ohmh_xxx
ohmh --json requests "$WEBHOOK_ID" --limit 50 \
  | jq '.requests[] | {id, method, url, createdAt}'

# Full detail (headers + body) for a single request.
REQ_ID=...
ohmh --json request "$WEBHOOK_ID" "$REQ_ID" \
  | jq '.request | { method, url, headers, body }'

# If the body is JSON, parse it inline.
ohmh --json request "$WEBHOOK_ID" "$REQ_ID" \
  | jq '.request.body | fromjson? | { event_type, customer_id }'
```

---

## Resend a past request to a local port

The CLI's local forwarder replays the stored request directly to the chosen port — there is no server round-trip and no record of the resend on the server side:

```bash
WEBHOOK_ID=ohmh_xxx
REQ_ID=...
PORT=3000

ohmh --json resend "$WEBHOOK_ID" "$REQ_ID" --port "$PORT" \
  | jq '{ status, durationMs, error }'
```

A `null` `status` means the request never reached the local port (port closed, connection refused, etc.). The `error` field carries the reason.

---

## Reproduce a webhook from an external service end-to-end

Steps:

1. Start `ohmh` using Pattern A or C from `SKILL.md` and capture the URL.
2. Configure the external service's webhook endpoint to that URL (via its dashboard, CLI, or API).
3. Trigger an event from the external service. For example:
   - Stripe: `stripe trigger payment_intent.succeeded`
   - GitHub: open/close a test issue or PR while subscribed to the relevant event
4. Wait for the matching `request` event on `ohmh`'s output.

If you started `ohmh` with Pattern C (NDJSON file polling), step 4 is:

```bash
until grep -q '"type":"request"' /tmp/ohmh.ndjson; do sleep 0.2; done
jq 'select(.type=="request") | { method, path, status, durationMs }' \
  /tmp/ohmh.ndjson
```

If you used Pattern A (stream-and-filter), the `"type":"request"` line will appear in the agent's stdout context directly.

---

## CI: assert webhook delivery

Use anonymous + ephemeral so the run is free and the server cleans up automatically when the WebSocket disconnects:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Start the local server under test.
node test-server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

# Start ohmh in anonymous mode (Pattern C).
npx ohmh --port 3000 --json > /tmp/ohmh.ndjson 2> /tmp/ohmh.log &
OHMH_PID=$!
trap 'kill "$SERVER_PID" "$OHMH_PID" 2>/dev/null' EXIT

# Wait up to 30s for ohmh to be ready.
for _ in $(seq 1 150); do
  grep -q '"type":"ready"' /tmp/ohmh.ndjson && break
  sleep 0.2
done
grep -q '"type":"ready"' /tmp/ohmh.ndjson \
  || { echo "ohmh did not become ready"; exit 1; }
URL=$(jq -r 'select(.type=="ready") | .url' /tmp/ohmh.ndjson | head -1)

# Send the webhook (here a direct curl stands in for an external service).
curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"event":"test"}' "$URL"

# Wait up to 10s for delivery, then assert 2xx.
for _ in $(seq 1 50); do
  grep -q '"type":"request"' /tmp/ohmh.ndjson && break
  sleep 0.2
done
RESULT=$(jq -c 'select(.type=="request")' /tmp/ohmh.ndjson | head -1)
[ -n "$RESULT" ] || { echo "no request received"; exit 1; }
STATUS=$(echo "$RESULT" | jq -r .status)
[[ "$STATUS" =~ ^2 ]] || { echo "unexpected status: $STATUS"; exit 1; }

echo "OK: webhook delivered with status $STATUS"
```

---

## Reuse an existing persistent webhook (avoid creating a new one)

When the user already has at least one persistent webhook, prefer reusing it over calling `ohmh create`. Creating a new persistent webhook can raise the period's peak count and increase the bill:

```bash
ID=$(ohmh --json list \
       | jq -r '.webhooks[] | select(.expiresAt == null) | .id' \
       | head -1)
if [ -z "$ID" ]; then
  echo "No persistent webhook found."
  echo "Run 'ohmh create' only if a persistent webhook is genuinely needed (will be billed)."
  exit 1
fi

ohmh --port 3000 --id "$ID" --json \
  | grep --line-buffered -E '"type":"(ready|request|error)"'
```

---

## Cleanup pattern combined with NDJSON file polling

Variant of the basic cleanup pattern in `SKILL.md`, when stdout streaming is unavailable. The `trap` deletes the webhook **and** kills the background process, both on normal exit and on signals:

```bash
ID=$(ohmh --json create | jq -r '.webhook.id')

ohmh --port 3000 --id "$ID" --json \
  > /tmp/ohmh.ndjson 2> /tmp/ohmh.log &
PID=$!
trap 'ohmh delete "$ID" --yes 2>/dev/null; kill "$PID" 2>/dev/null' \
  EXIT INT TERM

until grep -q '"type":"ready"' /tmp/ohmh.ndjson; do sleep 0.2; done
URL=$(jq -r 'select(.type=="ready") | .url' /tmp/ohmh.ndjson | head -1)
echo "Persistent URL: $URL"

# (drive the test that triggers a webhook arrival)

until grep -q '"type":"request"' /tmp/ohmh.ndjson; do sleep 0.2; done
jq 'select(.type=="request")' /tmp/ohmh.ndjson
# the trap will delete the webhook and kill ohmh on exit
```
