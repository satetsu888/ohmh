import { useEffect, useState } from "react";
import { VscodeTableRow } from "@vscode-elements/react-elements";
import { Webhook } from "../../../core/src/stateStore";
import { WebhookSourceRequest } from "../../../core/src/api";
import { VSCodeApi } from "../types/vscode";
import { ExpandToggleCell } from "./row/ExpandToggleCell";
import { ConnectionStatusCell } from "./row/ConnectionStatusCell";
import { PortConnectCell } from "./row/PortConnectCell";
import { WebhookUrlCell } from "./row/WebhookUrlCell";
import { ExpandedRequests } from "./row/ExpandedRequests";
import { RequestDetailModal } from "./RequestDetailModal";
import { useSavedPort } from "../hooks/useSavedPort";
import { useWebhookRequestsLoader } from "../hooks/useWebhookRequestsLoader";
import { ResendRequestMessage } from "../messages";
import { fetchWebhookRequestDetail } from "../utils/fetchWebhookRequestDetail";
import { ForwardResult } from "../hooks/useExtensionState";

type Props = {
  webhook: Webhook;
  startConnect: (webhookId: string, port: number) => void;
  stopConnect: (webhookId: string) => void;
  vscode: VSCodeApi;
  isExpanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
  requests: WebhookSourceRequest[];
  forwardResults: Record<string, ForwardResult>;
  selectedRequest: WebhookSourceRequest | null;
  setSelectedRequest: (request: WebhookSourceRequest | null) => void;
};

const REL_TIME_REFRESH_MS = 30_000;

/**
 * One webhook's row (the row body plus the request history when expanded).
 * Renders by delegating to child cells based on state; performs no DOM work itself.
 */
export const WebhooksTableRow = ({
  webhook,
  startConnect,
  stopConnect,
  vscode,
  isExpanded,
  onToggleExpand,
  requests,
  forwardResults,
  selectedRequest,
  setSelectedRequest,
}: Props) => {
  const hasUrl = webhook.id !== "";
  const isAnonymous = webhook.isAnonymous === true;
  const isEphemeral = webhook.isEphemeral === true;

  const [port, setPort] = useSavedPort(vscode, webhook.id, {
    skip: isAnonymous,
    initial: webhook.localPort,
  });

  const requestsLoader = useWebhookRequestsLoader({
    vscode,
    webhookId: webhook.id,
  });

  // Periodically refresh the relative-time labels while the row is expanded.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isExpanded || requests.length === 0) return;
    const id = setInterval(() => setTick((n) => n + 1), REL_TIME_REFRESH_MS);
    return () => clearInterval(id);
  }, [isExpanded, requests.length]);

  const handleToggleExpand = () => {
    // Anon / ephemeral webhooks have no server-side history, so skip the fetch
    // (and skip when no id has been issued yet).
    if (!isExpanded && hasUrl && !isAnonymous && !isEphemeral && requests.length === 0) {
      requestsLoader.request();
    }
    onToggleExpand(!isExpanded);
  };

  // For anon / ephemeral, the webview already holds the body via the WS push,
  // so pass the request through as-is. For authed persistent history, the list
  // API does not include body/headers, so refetch the detail before forwarding.
  const handleResend = async (request: WebhookSourceRequest) => {
    if (isAnonymous || isEphemeral) {
      vscode.postMessage(ResendRequestMessage(webhook.id, request));
      return;
    }
    const full = await fetchWebhookRequestDetail(vscode, webhook.id, request.id);
    if (!full) return;
    vscode.postMessage(ResendRequestMessage(webhook.id, full));
  };

  return (
    <>
      <VscodeTableRow>
        <ExpandToggleCell expanded={isExpanded} onToggle={handleToggleExpand} />
        <ConnectionStatusCell connection={webhook.connection} />
        <PortConnectCell
          connection={webhook.connection}
          port={port}
          onPortChange={setPort}
          onConnect={(p) => startConnect(webhook.id, p)}
          onDisconnect={() => stopConnect(webhook.id)}
        />
        <WebhookUrlCell webhook={webhook} />
      </VscodeTableRow>

      {isExpanded && (
        <ExpandedRequests
          loading={requestsLoader.loading}
          requests={requests}
          canResend={webhook.connection === "connected"}
          forwardResults={forwardResults}
          onSelect={setSelectedRequest}
          onResend={handleResend}
        />
      )}

      <RequestDetailModal
        request={selectedRequest}
        forwardResult={selectedRequest ? forwardResults[selectedRequest.id] ?? null : null}
        onClose={() => setSelectedRequest(null)}
        vscode={vscode}
        webhookId={webhook.id}
        webhook={webhook}
      />
    </>
  );
};
