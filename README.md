# Oh My Hooks Clients

Client implementations for [Oh My Hooks](https://oh-my-hooks.com), a webhook management service that gives you a unique subdomain to receive webhooks and forward them anywhere — including a port on your local machine.

This repository contains two clients plus the code they share:

- **[`cli/`](./cli)** — `ohmh` CLI. Zero-install entry point: `npx ohmh --port 3000`
- **[`extension/`](./extension)** — VS Code extension that integrates webhook management into the editor
- **[`shared/`](./shared)** — protocol types and runtime modules used by both clients (internal; not published as a package)

The web service (`https://oh-my-hooks.com`) itself is closed source and lives in a separate, private repository.

## Quick start (CLI)

```bash
# Forward webhooks to localhost:3000 with an anonymous ephemeral URL
npx ohmh --port 3000
```

See [`cli/README.md`](./cli/README.md) for the full command reference.

## VS Code extension

Install **Oh My Hooks** from the VS Code Marketplace, sign in via the command palette, and create / connect webhooks from the side panel. See [`extension/README.md`](./extension/README.md) for details.

## License

MIT — see [LICENSE](./LICENSE).
