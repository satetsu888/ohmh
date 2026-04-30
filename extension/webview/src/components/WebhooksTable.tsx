import {
  VscodeTable,
  VscodeTableHeader,
  VscodeTableHeaderCell,
  VscodeTableBody,
} from "@vscode-elements/react-elements";
import { Webhook } from "../../../core/src/stateStore";
import { WebhooksTableRow } from "./WebhooksTableRow";
import { VSCodeApi } from "../types/vscode";
import { WebhookSourceRequest } from "../../../core/src/api";
import { ForwardResult } from "../hooks/useExtensionState";

type Props = {
  webhooks: Webhook[];
  isGuestMode: boolean;
  startConnect: (WebhookId: string, port: number) => void;
  stopConnect: (WebhookId: string) => void;
  vscode: VSCodeApi;
  expandedWebhooks: string[];
  setExpandedWebhooks: (webhooks: string[]) => void;
  requestsData: Record<string, WebhookSourceRequest[]>;
  setRequestsData: (data: Record<string, WebhookSourceRequest[]>) => void;
  forwardResults: Record<string, ForwardResult>;
  selectedRequestModal: {webhookId: string, request: WebhookSourceRequest} | null;
  setSelectedRequestModal: (modal: {webhookId: string, request: WebhookSourceRequest} | null) => void;
};

export const WebhooksTable = ({
  webhooks,
  isGuestMode,
  startConnect,
  stopConnect,
  vscode,
  expandedWebhooks,
  setExpandedWebhooks,
  requestsData,
  setRequestsData,
  forwardResults,
  selectedRequestModal,
  setSelectedRequestModal
}: Props) => {
  return (
    // VscodeTable は first row の cell DOM に直接 style.width を書き込み、
    // その cell 参照を内部キャッシュで持ち続ける (MutationObserver で再評価しない)。
    // guest↔auth 遷移では行の DOM が完全に入れ替わり、新しい cell に width が適用されないため
    // テーブル自体に key を付けて web component ごと作り直し、内部キャッシュをリセットする。
    <VscodeTable key={isGuestMode ? "guest" : "auth"} columns={["32px", "44px", "160px", "auto"]}>
      <VscodeTableHeader slot="header">
        <VscodeTableHeaderCell></VscodeTableHeaderCell>
        <VscodeTableHeaderCell></VscodeTableHeaderCell>
        <VscodeTableHeaderCell>LOCAL PORT</VscodeTableHeaderCell>
        <VscodeTableHeaderCell>WEBHOOK URL</VscodeTableHeaderCell>
      </VscodeTableHeader>
      <VscodeTableBody slot="body">
        {webhooks.map((webhook, index) => (
          <WebhooksTableRow
            // entry の id は ephemeral webhook では Connect/Disconnect で変動するため、
            // React key には id ではなく安定した index を使う (リストは並び替えされない)。
            key={index}
            webhook={webhook}
            startConnect={startConnect}
            stopConnect={stopConnect}
            vscode={vscode}
            isExpanded={expandedWebhooks.includes(webhook.id)}
            onToggleExpand={(expanded) => {
              if (expanded) {
                setExpandedWebhooks([...expandedWebhooks, webhook.id]);
              } else {
                setExpandedWebhooks(expandedWebhooks.filter(id => id !== webhook.id));
              }
            }}
            requests={requestsData[webhook.id] || []}
            onRequestsUpdate={(requests) => {
              setRequestsData({
                ...requestsData,
                [webhook.id]: requests
              });
            }}
            forwardResults={forwardResults}
            selectedRequest={selectedRequestModal?.webhookId === webhook.id ? selectedRequestModal.request : null}
            setSelectedRequest={(request) => {
              if (request) {
                setSelectedRequestModal({ webhookId: webhook.id, request });
              } else {
                setSelectedRequestModal(null);
              }
            }}
          />
        ))}
      </VscodeTableBody>
    </VscodeTable>
  );
};
