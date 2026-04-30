import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL = "https://oh-my-hooks.com";

export type CliConfig = {
  baseUrl: string;
  configDir: string;
  credentialsPath: string;
};

const stripTrailingSlash = (s: string): string =>
  s.endsWith("/") ? s.replace(/\/+$/, "") : s;

const resolveConfigDir = (): string => {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "ohmh");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return path.join(xdg, "ohmh");
  }
  return path.join(os.homedir(), ".config", "ohmh");
};

export const resolveBaseUrl = (override?: string): string => {
  const fromArg = override?.trim();
  if (fromArg) {
    return stripTrailingSlash(fromArg);
  }
  const fromEnv = process.env.OH_MY_HOOKS_BASE_URL?.trim();
  if (fromEnv) {
    return stripTrailingSlash(fromEnv);
  }
  return DEFAULT_BASE_URL;
};

export const resolveCliConfig = (override?: string): CliConfig => {
  const configDir = resolveConfigDir();
  return {
    baseUrl: resolveBaseUrl(override),
    configDir,
    credentialsPath: path.join(configDir, "credentials.json"),
  };
};

export const buildWsUrl = (baseUrl: string): string => {
  return baseUrl.replace(/^http/, "ws") + "/ws";
};

export const buildWebhookUrl = (baseUrl: string, webhookId: string): string => {
  const u = new URL("/", baseUrl);
  return u.toString().replace(u.host, `${webhookId}.${u.host}`);
};
