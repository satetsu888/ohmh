import { useState } from "react";
import { VSCodeApi } from "../types/vscode";
import { WebhookSourceRequest } from "../../../core/src/api";
import { useExtensionMessage } from "./useExtensionMessage";

type Args = {
  vscode: VSCodeApi;
  webhookId: string;
  onLoaded: (requests: WebhookSourceRequest[]) => void;
};

/**
 * On-demand loader for a webhook's request history.
 * - Calling request() asks the extension for getWebhookRequests and sets loading=true.
 * - When the response arrives, calls onLoaded and flips loading back to false.
 */
export const useWebhookRequestsLoader = ({ vscode, webhookId, onLoaded }: Args) => {
  const [loading, setLoading] = useState(false);

  useExtensionMessage((msg) => {
    if (msg.type !== "webhookRequestsResponse") {return;}
    if (msg.args?.webhookId !== webhookId) {return;}
    const requests = (msg.args?.requests as WebhookSourceRequest[] | undefined) ?? [];
    onLoaded(requests);
    setLoading(false);
  });

  const request = () => {
    if (!webhookId || loading) {return;}
    setLoading(true);
    vscode.postMessage({ type: "getWebhookRequests", args: { webhookId } });
  };

  return { loading, request };
};
