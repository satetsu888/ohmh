# Change Log

All notable changes to the "ohmh" extension are documented in this file.

This project adheres to [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## 0.1.0 — 2026-05-04

### Added

- Initial release.
- Bottom panel UI listing ephemeral and persistent webhooks.
- Ephemeral webhook: Connect creates a session-scoped URL that lives only while connected (24h server-side TTL as a safety net).
- Persistent webhook: `Oh My Hooks: Create New Webhook` command creates an indefinite URL with server-side request history.
- Anonymous mode: Connect without signing in for a one-shot ephemeral URL (deleted on disconnect).
- Real-time webhook delivery via WebSocket, forwarded to `http://localhost:<port>`.
- GitHub OAuth (PKCE) sign-in via VS Code authentication API.
- `Oh My Hooks: Open Settings` command to manage plan and billing.
