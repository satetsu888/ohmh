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
 * 必要に応じて履歴をロードする。
 * - request() を呼ぶと extension に getWebhookRequests を依頼し、loading=true。
 * - レスポンスが届いたら onLoaded で親に伝え、loading=false に戻す。
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
