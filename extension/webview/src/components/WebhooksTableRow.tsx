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
  onRequestsUpdate: (requests: WebhookSourceRequest[]) => void;
  forwardResults: Record<string, ForwardResult>;
  selectedRequest: WebhookSourceRequest | null;
  setSelectedRequest: (request: WebhookSourceRequest | null) => void;
};

const REL_TIME_REFRESH_MS = 30_000;

/**
 * Webhook 1 件分の行 (本体 + 展開時の履歴)。状態に応じて子セルに描画を委ねるだけで、
 * このコンポーネント自身は DOM 操作を一切持たない。
 */
export const WebhooksTableRow = ({
  webhook,
  startConnect,
  stopConnect,
  vscode,
  isExpanded,
  onToggleExpand,
  requests,
  onRequestsUpdate,
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
    onLoaded: onRequestsUpdate,
  });

  // 展開中の相対時刻表示を一定間隔でリフレッシュ
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isExpanded || requests.length === 0) return;
    const id = setInterval(() => setTick((n) => n + 1), REL_TIME_REFRESH_MS);
    return () => clearInterval(id);
  }, [isExpanded, requests.length]);

  const handleToggleExpand = () => {
    // anon / ephemeral webhook はサーバ履歴を持たないので fetch しない (id 未払い出しでも同様)
    if (!isExpanded && hasUrl && !isAnonymous && !isEphemeral && requests.length === 0) {
      requestsLoader.request();
    }
    onToggleExpand(!isExpanded);
  };

  // anon / ephemeral は WS push で body 込みの request を webview が保持しているのでそのまま渡す。
  // 認証ユーザの persistent 履歴は list API が body/headers を含まないため、detail を取り直してから forward に流す。
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
