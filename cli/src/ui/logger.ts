// 人間向け出力 (stderr) と機械可読出力 (stdout / NDJSON) を分離するための薄いラッパ。
// --json モード時は人間向けは stderr、イベントは stdout に出す。

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
  // JSON モードでは stdout を汚さないため stderr に出す。
  // 人間モードでは通常 stdout で良いが、connect の per-request 出力 (stdout) と
  // 進捗ログを混ぜないため、進捗系も全て stderr に統一する。
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
  // エラーは quiet でも出す。jsonMode でも stderr に出して stdout を汚さない。
  writeHuman(`error: ${msg}`);
};

export const debug = (msg: string): void => {
  if (!verbose || jsonMode) {
    return;
  }
  writeHuman(`debug: ${msg}`);
};

// 機械可読 (NDJSON) 出力。jsonMode のときだけ stdout に流す。
export const emitJsonEvent = (event: Record<string, unknown>): void => {
  if (!jsonMode) {
    return;
  }
  process.stdout.write(JSON.stringify(event) + "\n");
};

// 人間向けの per-event 1 行出力 (connect 中の request ログ等)。
// 非 JSON モード時のみ stdout に出す。
export const emitHumanLine = (line: string): void => {
  if (jsonMode) {
    return;
  }
  process.stdout.write(line + "\n");
};
