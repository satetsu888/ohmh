# Oh My Hooks

Receive webhooks at a unique public URL and forward them to a local port — without leaving VS Code.

Test webhooks from third-party services (Stripe, GitHub, Slack, …) on your laptop without exposing it to the internet. Oh My Hooks gives you a public URL, streams incoming requests over WebSocket, and forwards them to `http://localhost:<port>` of your choice. The forwarded response stays local — nothing about your local server is sent back to the cloud.

## Quick start

1. Open the **Oh My Hooks** panel from the bottom panel area of VS Code.
2. Click **Sign in** to authenticate via your browser (GitHub OAuth). Or skip sign-in: click **Connect** on the anonymous row to try an ephemeral URL with no account.
3. Enter your local port (e.g. `3000`) and **Connect**. A unique webhook URL like `https://ohmh-xxx.satetsu888.dev/` appears.
4. Point a webhook source (Stripe, GitHub, …) at that URL. Incoming requests are forwarded to `http://localhost:<port>` and shown in the panel with method / status / duration.

## Webhook types

| Kind | Lifetime | How to create |
|---|---|---|
| **Ephemeral** | While the connection is open (24h server-side TTL as a safety net) | Connect on the ephemeral row in the panel (auto-created) |
| **Persistent** | Indefinite; request history kept on the server | `Oh My Hooks: Create New Webhook` from the command palette |

Anonymous mode produces an ephemeral webhook that is **deleted on disconnect** — no history, no account required.

## Plans

| Plan | Price | Ephemeral | Persistent | Requests / day | History |
|---|---|---|---|---|---|
| Anonymous | $0 | 1 | 0 | 100 | none |
| Free | $0 | 1 | 0 | 100 | none |
| Metered | $0 base + $0.60/peak persistent/mo | 1 | 10 | 500 | 30 days |

Manage your plan at [ohmh.satetsu888.dev/settings](https://ohmh.satetsu888.dev/settings) or via the command palette: `Oh My Hooks: Open Settings`.

## Commands

| Command | Description |
|---|---|
| `Oh My Hooks: Create New Webhook` | Create a persistent webhook tied to your account |
| `Oh My Hooks: Open Settings` | Open the web settings page (plan / billing) |

## Companion CLI

Prefer a terminal? The same service ships with [`ohmh`](https://www.npmjs.com/package/ohmh) — a zero-install Node CLI:

```bash
npx ohmh --port 3000
```

## License

MIT
