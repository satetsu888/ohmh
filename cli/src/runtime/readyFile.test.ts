import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unlinkReadyFile, writeReadyFile } from "./readyFile";

describe("readyFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ohmh-rfile-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writeReadyFile writes a JSON line with url/webhookId/mode and is mode 0600", () => {
    const path = join(dir, "ready");
    writeReadyFile(path, {
      url: "https://ohmh_x.example/",
      webhookId: "ohmh_x",
      mode: "anonymous",
    });

    const content = readFileSync(path, "utf8");
    expect(content.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(content.trim());
    expect(parsed).toEqual({
      url: "https://ohmh_x.example/",
      webhookId: "ohmh_x",
      mode: "anonymous",
    });

    if (process.platform !== "win32") {
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("writeReadyFile overwrites if the file already exists", () => {
    const path = join(dir, "ready");
    writeReadyFile(path, { url: "u1", webhookId: "id1", mode: "ephemeral" });
    writeReadyFile(path, { url: "u2", webhookId: "id2", mode: "persistent" });

    const parsed = JSON.parse(readFileSync(path, "utf8").trim());
    expect(parsed).toEqual({ url: "u2", webhookId: "id2", mode: "persistent" });
  });

  it("unlinkReadyFile removes an existing file", () => {
    const path = join(dir, "ready");
    writeReadyFile(path, { url: "u", webhookId: "id", mode: "anonymous" });
    expect(existsSync(path)).toBe(true);
    unlinkReadyFile(path);
    expect(existsSync(path)).toBe(false);
  });

  it("unlinkReadyFile is a no-op when the file does not exist", () => {
    const path = join(dir, "missing");
    expect(() => unlinkReadyFile(path)).not.toThrow();
  });
});
