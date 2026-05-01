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

// Single-line human-readable per-event output (e.g. request logs during `connect`).
// Only emitted to stdout when not in JSON mode.
export const emitHumanLine = (line: string): void => {
  if (jsonMode) {
    return;
  }
  process.stdout.write(line + "\n");
};
