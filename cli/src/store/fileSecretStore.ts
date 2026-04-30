import fs from "node:fs/promises";
import path from "node:path";
import { SecretStore } from "../../../shared/secretStore";

// XDG 準拠の credentials.json (chmod 0600) で token を保持する SecretStore 実装。
// shape:
//   {
//     "version": 1,
//     "tokens": { "<key>": { "value": "<accessToken>", "savedAt": <unix-seconds> } }
//   }

type StoredEntry = { value: string; savedAt: number };
type StoreShape = {
  version: 1;
  tokens: Record<string, StoredEntry>;
};

const emptyStore = (): StoreShape => ({ version: 1, tokens: {} });

const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
  // best-effort で 0700 (Windows では noop)
  try {
    await fs.chmod(dir, 0o700);
  } catch {
    /* ignore */
  }
};

const readStore = async (filePath: string): Promise<StoreShape> => {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return emptyStore();
    }
    throw err;
  }
  // ファイルが壊れている / 旧フォーマットの場合は空 store として扱い、次の set で書き直させる。
  // 認証情報が消えるのは許容範囲 (再 login で復旧)。CLI を起動不能にする方がはるかに痛い。
  try {
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (parsed && parsed.version === 1 && parsed.tokens && typeof parsed.tokens === "object") {
      return { version: 1, tokens: { ...parsed.tokens } };
    }
  } catch {
    /* fall through */
  }
  return emptyStore();
};

const writeStore = async (filePath: string, store: StoreShape): Promise<void> => {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.${process.pid}.tmp`;
  // 0600 で生成 (Windows では mode は無視される)
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    /* ignore */
  }
  await fs.rename(tmp, filePath);
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    /* ignore */
  }
};

const isNodeError = (err: unknown): err is NodeJS.ErrnoException => {
  return typeof err === "object" && err !== null && "code" in err;
};

export class FileSecretStore implements SecretStore {
  constructor(private readonly filePath: string) {}

  async get(key: string): Promise<string | undefined> {
    const store = await readStore(this.filePath);
    return store.tokens[key]?.value;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await readStore(this.filePath);
    store.tokens[key] = { value, savedAt: Math.floor(Date.now() / 1000) };
    await writeStore(this.filePath, store);
  }

  async delete(key: string): Promise<void> {
    const store = await readStore(this.filePath);
    if (key in store.tokens) {
      delete store.tokens[key];
      await writeStore(this.filePath, store);
    }
  }
}

export const tokenKeyFor = (baseUrl: string): string => `token:${baseUrl}`;
