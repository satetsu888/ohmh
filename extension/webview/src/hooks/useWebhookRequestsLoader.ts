import { useEffect, useRef, useState } from "react";
import { VSCodeApi } from "../types/vscode";
import { useExtensionMessage } from "./useExtensionMessage";

type Args = {
  vscode: VSCodeApi;
  webhookId: string;
};

const LOADING_TIMEOUT_MS = 10_000;

export const useWebhookRequestsLoader = ({ vscode, webhookId }: Args) => {
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const clearLoadingTimeout = () => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  };

  useExtensionMessage((msg) => {
    if (msg.type !== "webhookRequestsFetched") return;
    if (msg.args?.webhookId !== webhookId) return;
    clearLoadingTimeout();
    setLoading(false);
  });

  const request = () => {
    if (!webhookId || loading) return;
    setLoading(true);
    clearLoadingTimeout();
    timeoutRef.current = setTimeout(() => setLoading(false), LOADING_TIMEOUT_MS);
    vscode.postMessage({ type: "getWebhookRequests", args: { webhookId } });
  };

  useEffect(() => clearLoadingTimeout, []);

  return { loading, request };
};
