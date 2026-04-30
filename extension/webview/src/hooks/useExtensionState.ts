import { useEffect, useRef, useState } from "react";
import { Webhook } from "../../../core/src/stateStore";
import { WebhookSourceRequest } from "../../../core/src/api";

import { VSCodeApi } from "../types/vscode";

// WS push で受信したリクエストを webview メモリで保持する件数の上限
// (ExpandedRequests.MAX_ROWS と揃える)
const PUSHED_HISTORY_MAX_ROWS = 5;

// 各 source request の最後の forward 結果。サーバには記録せず、webview のローカル状態のみ。
export type ForwardResult = {
  status: number | null;
  error: string | null;
  durationMs: number;
};


export const useExtensionState = (vscode?: VSCodeApi) => {
    const [hasSession, setHasSession] = useState<boolean>(false);
    const [isGuestMode, setIsGuestMode] = useState<boolean>(false);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [expandedWebhooks, setExpandedWebhooks] = useState<string[]>([]);
    const [requestsData, setRequestsData] = useState<Record<string, WebhookSourceRequest[]>>({});
    const [forwardResults, setForwardResults] = useState<Record<string, ForwardResult>>({});
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [selectedRequestModal, setSelectedRequestModal] = useState<{webhookId: string, request: WebhookSourceRequest} | null>(null);

    const messageHandler = (event: any) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "statusChanged":
          setHasSession(message.args.hasSession);
          setIsGuestMode(message.args.isGuestMode || false);
          setWebhooks(message.args.webhooks);
          if (!isInitialized) {
            setIsInitialized(true);
          }
          break;
        case "connectionChanged":
          console.log("Connection changed", message.args);
          break;
        case "viewStateResponse":
          if (message.args.expandedWebhooks) {
            setExpandedWebhooks(message.args.expandedWebhooks);
          }
          if (message.args.requestsData) {
            setRequestsData(message.args.requestsData);
          }
          if (message.args.selectedRequestModal) {
            setSelectedRequestModal(message.args.selectedRequestModal);
          }
          break;
        case "refreshRequestsForWebhook":
          // Trigger a re-fetch of requests for the specified webhook
          if (message.args.webhookId && vscode) {
            // Send message to get updated requests
            vscode.postMessage({
              type: 'getWebhookRequests',
              args: { webhookId: message.args.webhookId }
            });
          }
          break;
        case "refreshAllExpandedWebhooks":
          // Refresh all expanded webhooks
          if (message.args.webhookIds && vscode) {
            message.args.webhookIds.forEach((webhookId: string) => {
              vscode.postMessage({
                type: 'getWebhookRequests',
                args: { webhookId }
              });
            });
          }
          break;
        case "webhookRequestReceived": {
          // WS push で受信したリクエストを webview のメモリにそのまま積む。
          // ephemeral / anon はサーバ履歴がないので必須、persistent でも即時反映のために使う。
          const { webhookId, request } = message.args || {};
          if (!webhookId || !request) {break;}
          setRequestsData((prev) => {
            const existing = prev[webhookId] ?? [];
            // 同じ id の重複は避ける (サーバ refresh と push の競合用)
            const filtered = existing.filter((r) => r.id !== request.id);
            return {
              ...prev,
              [webhookId]: [request, ...filtered].slice(0, PUSHED_HISTORY_MAX_ROWS),
            };
          });
          break;
        }
        case "webhookForwardResult": {
          const { sourceRequestId, result } = message.args || {};
          if (!sourceRequestId || !result) {break;}
          setForwardResults((prev) => ({
            ...prev,
            [sourceRequestId]: result,
          }));
          break;
        }
        default:
          console.log("Unknown message", message.type);
      }
    };

    useEffect(() => {
      window.addEventListener("message", messageHandler);
      return () => window.removeEventListener("message", messageHandler);
    }, [isInitialized, vscode]);

    // anon webhook の id 切り替わり (Disconnect / 再 Connect) で古い履歴を消す。
    // guest mode の webhook entry は 1 つで、id は "" → 払い出し → "" を行き来する。
    const prevAnonIdRef = useRef<string>("");
    useEffect(() => {
      const anon = webhooks.find((w) => w.isAnonymous);
      const currentAnonId = anon?.id ?? "";
      const prevAnonId = prevAnonIdRef.current;
      if (prevAnonId && prevAnonId !== currentAnonId) {
        setRequestsData((prev) => {
          if (!(prevAnonId in prev)) {return prev;}
          const next = { ...prev };
          delete next[prevAnonId];
          return next;
        });
      }
      prevAnonIdRef.current = currentAnonId;
    }, [webhooks]);


    return {
      hasSession,
      isGuestMode,
      webhooks,
      expandedWebhooks,
      setExpandedWebhooks,
      requestsData,
      setRequestsData,
      forwardResults,
      isInitialized,
      selectedRequestModal,
      setSelectedRequestModal
    };
};

