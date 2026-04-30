// VS Code 非依存の SecretStore interface.
// 拡張側は vscode.SecretStorage 実装を、CLI は keytar 実装を注入する。

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
