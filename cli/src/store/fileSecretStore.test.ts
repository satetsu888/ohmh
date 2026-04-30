import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSecretStore, tokenKeyFor } from "./fileSecretStore";

const isWindows = process.platform === "win32";

let tmpRoot: string;
let storePath: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ohmh-store-"));
  storePath = path.join(tmpRoot, "nested", "credentials.json");
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("FileSecretStore", () => {
  it("returns undefined when the file does not exist", async () => {
    const store = new FileSecretStore(storePath);
    expect(await store.get("token:https://x")).toBeUndefined();
  });

  it("set + get round-trips a value and creates the parent directory", async () => {
    const store = new FileSecretStore(storePath);
    await store.set("token:https://x", "TKN-1");
    expect(await store.get("token:https://x")).toBe("TKN-1");
    const stat = await fs.stat(path.dirname(storePath));
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates the credentials file with mode 0600 (Unix only)", async () => {
    if (isWindows) {
      return;
    }
    const store = new FileSecretStore(storePath);
    await store.set("token:https://x", "TKN");
    const stat = await fs.stat(storePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("multiple keys coexist in the same file", async () => {
    const store = new FileSecretStore(storePath);
    await store.set("token:a", "A");
    await store.set("token:b", "B");
    expect(await store.get("token:a")).toBe("A");
    expect(await store.get("token:b")).toBe("B");
  });

  it("delete removes only the specified key", async () => {
    const store = new FileSecretStore(storePath);
    await store.set("token:a", "A");
    await store.set("token:b", "B");
    await store.delete("token:a");
    expect(await store.get("token:a")).toBeUndefined();
    expect(await store.get("token:b")).toBe("B");
  });

  it("delete on a missing key is a no-op", async () => {
    const store = new FileSecretStore(storePath);
    await store.delete("token:never");
    // ファイルは作られない (no rewrite)
    await expect(fs.stat(storePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("set overwrites an existing key", async () => {
    const store = new FileSecretStore(storePath);
    await store.set("token:a", "old");
    await store.set("token:a", "new");
    expect(await store.get("token:a")).toBe("new");
  });

  it("does NOT leak state across two stores backed by different files (regression: shared empty-store reference)", async () => {
    // 過去に EMPTY_STORE をモジュール定数として保持し `{ ...EMPTY_STORE }` でコピーしていた結果、
    // tokens オブジェクトが共有されて store A への set が store B からも見えるバグがあった。
    // 同名キーで別パス・別 store を使い、相互不可侵を担保する。
    const pathA = path.join(tmpRoot, "a", "credentials.json");
    const pathB = path.join(tmpRoot, "b", "credentials.json");
    const storeA = new FileSecretStore(pathA);
    const storeB = new FileSecretStore(pathB);
    await storeA.set("token:k", "from-A");
    expect(await storeB.get("token:k")).toBeUndefined();
    await storeB.set("token:k", "from-B");
    expect(await storeA.get("token:k")).toBe("from-A");
    expect(await storeB.get("token:k")).toBe("from-B");
  });

  it("recovers from a corrupted (non-JSON) file by treating it as empty on next read", async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, "not-json{}{");
    const store = new FileSecretStore(storePath);
    expect(await store.get("token:a")).toBeUndefined();
    // 次の set で書き直されること
    await store.set("token:a", "ok");
    expect(await store.get("token:a")).toBe("ok");
  });
});

describe("tokenKeyFor", () => {
  it("uses the BASE_URL as the disambiguating part of the key", () => {
    expect(tokenKeyFor("https://oh-my-hooks.com")).toBe("token:https://oh-my-hooks.com");
    expect(tokenKeyFor("http://localhost:8787")).toBe("token:http://localhost:8787");
  });
});
