import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";

// Done-file pattern hook: write a JSON 1-liner with the webhook URL the
// moment the WS is up and the webhook id is known. Shell scripts and AI
// agents can `until [ -f /tmp/ohmh.ready ]; do sleep 0.1; done` to wait.
//
// Mode 0o600 because the file content reveals the user's webhook URL
// (which is effectively a capability for receiving webhooks until disconnect
// or, for persistent, until deletion).

export type ReadyFilePayload = {
  url: string;
  webhookId: string;
  mode: "anonymous" | "ephemeral" | "persistent";
};

export const writeReadyFile = (path: string, payload: ReadyFilePayload): void => {
  const fd = openSync(path, "w", 0o600);
  try {
    writeSync(fd, JSON.stringify(payload) + "\n");
  } finally {
    closeSync(fd);
  }
};

export const unlinkReadyFile = (path: string): void => {
  try {
    unlinkSync(path);
  } catch {
    // Best-effort: it's fine if the file is already gone (e.g. user removed it).
  }
};
