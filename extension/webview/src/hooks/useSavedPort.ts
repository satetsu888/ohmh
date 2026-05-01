import { useEffect, useState } from "react";
import { GetWebhookPortMessage } from "../messages";
import { VSCodeApi } from "../types/vscode";
import { useExtensionMessage } from "./useExtensionMessage";

const DEFAULT_PORT = 3000;

/**
 * Fetches the saved port for an authenticated user's persistent webhook from the extension.
 * - When skip=true (e.g. anonymous webhook), the extension is not queried and the
 *   externally provided `initial` port is kept.
 * - The resolved value is returned as this hook's own state, not pushed back to the caller.
 */
export const useSavedPort = (
  vscode: VSCodeApi,
  webhookId: string,
  options: { skip?: boolean; fallback?: number; initial?: number | null } = {}
) => {
  const { skip = false, fallback = DEFAULT_PORT, initial } = options;
  const [port, setPort] = useState<number | null>(initial ?? fallback);

  // React to changes in initial / skip.
  useEffect(() => {
    if (skip) {
      if (initial !== undefined && initial !== null) {
        setPort(initial);
      }
      return;
    }
    if (!webhookId) {
      return;
    }
    vscode.postMessage(GetWebhookPortMessage(webhookId));
  }, [vscode, webhookId, skip, initial]);

  useExtensionMessage((msg) => {
    if (msg.type !== "webhookPortResponse") {return;}
    if (msg.args?.webhookId !== webhookId) {return;}
    const saved = msg.args?.port;
    if (typeof saved === "number") {
      setPort(saved);
    } else {
      setPort(fallback);
    }
  });

  return [port, setPort] as const;
};
