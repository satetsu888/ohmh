# ohmh billing reference

Billing details for the `ohmh` service. Read this before calling `ohmh create`.

---

## Plans

| Plan | Base price | Usage | Ephemeral | Persistent | Requests/day | History |
|---|---|---|---|---|---|---|
| Anonymous | $0 | none | 1 (deleted on disconnect) | 0 | 100 | none |
| Free | $0 | none | 1 (24h TTL) | 0 | 100 | none |
| Metered | $0 | **$0.60/mo per persistent webhook (prorated)** | 1 (24h TTL) | up to 10 | 500 | 30 days |

Plan limits and pricing may change. The current values are visible at `https://ohmh.satetsu888.dev/settings`. If those values disagree with this document, treat the website as authoritative.

---

## How metered billing works

Persistent webhooks are billed at **$0.60 per webhook per month, prorated to the day**. You are charged only for the time each webhook exists within a billing period:

- Creating a persistent webhook starts a prorated charge immediately (for the remaining days in the period).
- Deleting a persistent webhook issues a prorated credit for the remaining days in the period.
- At the end of the period, the net charge reflects the actual holding time of each webhook.

Examples within a 30-day period:

- Hold 1 persistent webhook for the full 30 days → **$0.60**
- Create 1 persistent webhook, delete it after 15 days → **~$0.30**
- Create 2 webhooks on day 1, delete 1 on day 15 → **$0.60 + $0.30 = ~$0.90**

The lesson for AI usage: **deleting a persistent webhook stops the charge**, so cleanup always saves money. This is different from peak billing — there is no penalty for creating and quickly deleting a webhook.

---

## AI agent hygiene checklist

Before calling `ohmh create`:

1. **Did the user explicitly ask for a persistent webhook?** Phrases like "test it", "try it once", "see if it arrives" usually mean an anonymous + ephemeral setup is enough.
2. **Is there an existing persistent webhook to reuse?** Check `ohmh --json list | jq '.webhooks[] | select(.expiresAt == null)'`. Reusing one avoids an additional prorated charge.
3. **Is there a `trap` (or equivalent) that will delete the webhook on exit?** See the Cleanup pattern in `SKILL.md`.
4. **Will the user be informed before any leftover webhook stays alive?** When unsure, ask whether to keep or delete.

---

## Handling 402 (limit reached)

`ohmh create` returns exit code 3 with an `error` event when the plan's persistent slot count is already in use. The CLI distinguishes two cases by `webhookLimit`:

### Case 1 — Free creating persistent (`webhookLimit: 0`)

```jsonc
{
  "type": "error",
  "code": "plan_limit_upgradable",
  "exitCode": 3,
  "kind": "persistent",
  "webhookLimit": 0,
  "status": 402,
  "message": "Persistent webhook limit reached. Upgrade to Metered: …"
}
```

Resolution: the account needs to upgrade to Metered at `https://ohmh.satetsu888.dev/settings`. Do not perform the upgrade automatically; surface the message and let the user decide.

### Case 2 — Metered with all slots in use (`webhookLimit: 10`)

```jsonc
{
  "type": "error",
  "code": "plan_limit_top",
  "exitCode": 3,
  "kind": "persistent",
  "webhookLimit": 10,
  "status": 402,
  "message": "Persistent webhook limit reached on your current plan. Delete an unused one with `ohmh delete <id> --yes`."
}
```

Resolution: there is no higher tier. Delete an unused persistent webhook to free a slot. Use `ohmh --json list` to identify candidates and ask the user before deleting anything they own.

---

## Checking the estimated charge

For a Metered account, `ohmh whoami` shows the current persistent webhook count and an estimate:

```
$ ohmh whoami
Email   : foo@example.com
Plan    : Metered
Limits  : ephemeral 1 / persistent 10
Quotas  : 500 req/day · history 30d

This period:
  Persistent webhooks (current) : 3
  Estimated usage charge        : $1.80 (= 3 × $0.60)
```

In `--json` mode, the same information is in the `whoami` event under `currentPersistentCount` (number) and `estimatedUsageChargeCents` (number). Both fields are absent for Free and Anonymous accounts.

The estimated charge shown is based on the current webhook count × $0.60. The actual invoice reflects prorated charges for the entire period (including webhooks created and deleted mid-period). The authoritative invoice is in the billing portal accessible from `https://ohmh.satetsu888.dev/settings`.
