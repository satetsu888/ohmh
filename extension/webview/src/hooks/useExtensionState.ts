import { useEffect, useRef, useState } from "react";
import { Webhook } from "../../../core/src/stateStore";
import { WebhookSourceRequest } from "../../../core/src/api";

import { VSCodeApi } from "../types/vscode";

// Maximum number of WS-pushed requests we keep in the webview's memory.
// Kept aligned with ExpandedRequests.MAX_ROWS.
const PUSHED_HISTORY_MAX_ROWS = 5;

// Last forward result for each source request. Not persisted on the server;
// webview-local state only.
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
          if (message.args.webhookId && vscode) {
            vscode.postMessage({
              type: 'getWebhookRequests',
              args: { webhookId: message.args.webhookId }
            });
          }
          break;
        case "webhookRequestReceived": {
          // Append the WS-pushed request straight into the webview's in-memory list.
          // Required for ephemeral / anon (no server history); used for persistent
          // too so the row appears immediately.
          const { webhookId, request } = message.args || {};
          if (!webhookId || !request) {break;}
          setRequestsData((prev) => {
            const existing = prev[webhookId] ?? [];
            // Drop any entry with the same id to handle the server-refresh / push race.
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
      }
    };

    useEffect(() => {
      window.addEventListener("message", messageHandler);
      return () => window.removeEventListener("message", messageHandler);
    }, [isInitialized, vscode]);

    // Drop the stale history when the anon webhook id flips (Disconnect / reconnect).
    // The guest-mode webhook entry is single, and its id alternates "" → issued → "".
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

