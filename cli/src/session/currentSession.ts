import { resolveCliConfig } from "../config";
import { AuthRequiredError } from "../errors";
import { FileSecretStore, tokenKeyFor } from "../store/fileSecretStore";

export type ResolvedSession = {
  baseUrl: string;
  token: string;
  store: FileSecretStore;
  storeKey: string;
};

export const openSecretStore = (baseUrlOverride?: string): { baseUrl: string; store: FileSecretStore; storeKey: string } => {
  const config = resolveCliConfig(baseUrlOverride);
  const store = new FileSecretStore(config.credentialsPath);
  return { baseUrl: config.baseUrl, store, storeKey: tokenKeyFor(config.baseUrl) };
};

export const tryGetSession = async (baseUrlOverride?: string): Promise<ResolvedSession | null> => {
  const { baseUrl, store, storeKey } = openSecretStore(baseUrlOverride);
  const token = await store.get(storeKey);
  if (!token) {
    return null;
  }
  return { baseUrl, token, store, storeKey };
};

export const requireSession = async (baseUrlOverride?: string): Promise<ResolvedSession> => {
  const session = await tryGetSession(baseUrlOverride);
  if (!session) {
    throw new AuthRequiredError();
  }
  return session;
};
