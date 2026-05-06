// Thin wrapper that separates human-facing output (stderr) from machine-readable
// output (stdout / NDJSON). In --json mode, prose goes to stderr and event JSON
// goes to stdout.

let jsonMode = false;
let quiet = false;
let verbose = false;

export const setJsonMode = (enabled: boolean): void => {
  jsonMode = enabled;
};

export const setQuiet = (enabled: boolean): void => {
  quiet = enabled;
};

export const setVerbose = (enabled: boolean): void => {
  verbose = enabled;
};

export const isJsonMode = (): boolean => jsonMode;

const writeHuman = (line: string): void => {
  // Always go to stderr: keeps stdout clean in JSON mode, and avoids mixing
  // progress logs with `connect`'s per-request stdout output in human mode.
  process.stderr.write(line + "\n");
};

export const info = (msg: string): void => {
  if (quiet || jsonMode) {
    return;
  }
  writeHuman(msg);
};

export const success = (msg: string): void => {
  if (quiet || jsonMode) {
    return;
  }
  writeHuman(msg);
};

export const warn = (msg: string): void => {
  if (jsonMode) {
    return;
  }
  writeHuman(`warning: ${msg}`);
};

export const error = (msg: string): void => {
  // Errors are emitted even in quiet/json mode; stderr keeps stdout clean.
  writeHuman(`error: ${msg}`);
};

export const debug = (msg: string): void => {
  if (!verbose || jsonMode) {
    return;
  }
  writeHuman(`debug: ${msg}`);
};

// Machine-readable (NDJSON) output. Only emitted to stdout when jsonMode is on.
export const emitJsonEvent = (event: Record<string, unknown>): void => {
  if (!jsonMode) {
    return;
  }
  process.stdout.write(JSON.stringify(event) + "\n");
};

// JSON error event. Emitted to stdout in jsonMode in addition to the stderr
// `error()` line, so NDJSON consumers can branch on a structured `code`.
// Extra fields (e.g. kind/reason/webhookLimit/status from CreateWebhookError)
// are merged in if present on the error.
export const emitJsonError = (err: unknown, exitCode: number): void => {
  if (!jsonMode) {
    return;
  }
  const event: Record<string, unknown> = {
    type: "error",
    code: "general_error",
    exitCode,
    message: err instanceof Error ? err.message : String(err),
    name: err instanceof Error ? err.constructor.name : "Error",
  };
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string") event.code = e.code;
    if (typeof e.kind === "string") event.kind = e.kind;
    if (typeof e.reason === "string") event.reason = e.reason;
    if (typeof e.webhookLimit === "number") event.webhookLimit = e.webhookLimit;
    if (typeof e.status === "number") event.status = e.status;
  }
  process.stdout.write(JSON.stringify(event) + "\n");
};

// Single-line human-readable per-event output (e.g. request logs during `connect`).
// Only emitted to stdout when not in JSON mode.
export const emitHumanLine = (line: string): void => {
  if (jsonMode) {
    return;
  }
  process.stdout.write(line + "\n");
};
