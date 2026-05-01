// VS Code-agnostic SecretStore interface.
// The extension injects a vscode.SecretStorage-backed impl; the CLI injects a file-backed impl.

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
