import { openSecretStore } from "../session/currentSession";
import { emitJsonEvent, isJsonMode, success } from "../ui/logger";

export type LogoutOptions = {
  baseUrlOverride?: string;
};

export const logoutCommand = async (opts: LogoutOptions): Promise<void> => {
  const { baseUrl, store, storeKey } = openSecretStore(opts.baseUrlOverride);
  await store.delete(storeKey);
  if (isJsonMode()) {
    emitJsonEvent({ type: "logout", baseUrl });
    return;
  }
  success(`Logged out from ${baseUrl}`);
};
