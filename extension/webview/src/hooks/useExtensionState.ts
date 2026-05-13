import { useEffect, useState } from "react";
import { Webhook } from "../../../core/src/stateStore";
import { WebhookSourceRequest } from "../../../core/src/api";
import { ForwardResultPayload } from "../../../core/src/messages";

import { VSCodeApi } from "../types/vscode";

export type ForwardResult = ForwardResultPayload;

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
          if (message.args.forwardResults) {
            setForwardResults(message.args.forwardResults);
          }
          if (message.args.selectedRequestModal) {
            setSelectedRequestModal(message.args.selectedRequestModal);
          }
          break;
      }
    };

    useEffect(() => {
      window.addEventListener("message", messageHandler);
      return () => window.removeEventListener("message", messageHandler);
    }, [isInitialized, vscode]);

    return {
      hasSession,
      isGuestMode,
      webhooks,
      expandedWebhooks,
      setExpandedWebhooks,
      requestsData,
      forwardResults,
      isInitialized,
      selectedRequestModal,
      setSelectedRequestModal
    };
};

