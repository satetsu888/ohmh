import { WebhookSourceRequest } from "../../../core/src/api";
import { VSCodeApi } from "../types/vscode";

type IncomingMessage = { type?: string; args?: { requestId?: string; request?: WebhookSourceRequest | null } };

const parseEvent = (event: MessageEvent): IncomingMessage | null => {
  const raw = event.data;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as IncomingMessage;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    return raw as IncomingMessage;
  }
  return null;
};

/**
 * Ask the extension for getWebhookRequestDetail and resolve with the matching
 * webhookRequestDetailResponse exactly once. Resolves to null when the extension
 * returns request: null (failure case).
 */
export const fetchWebhookRequestDetail = (
  vscode: VSCodeApi,
  webhookId: string,
  requestId: string,
): Promise<WebhookSourceRequest | null> => {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = parseEvent(event);
      if (!msg || msg.type !== "webhookRequestDetailResponse") {return;}
      if (msg.args?.requestId !== requestId) {return;}
      window.removeEventListener("message", handler);
      resolve(msg.args.request ?? null);
    };
    window.addEventListener("message", handler);
    vscode.postMessage({
      type: "getWebhookRequestDetail",
      args: { webhookId, requestId },
    });
  });
};
