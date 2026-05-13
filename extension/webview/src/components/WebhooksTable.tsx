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
  forwardResults,
  selectedRequestModal,
  setSelectedRequestModal
}: Props) => {
  return (
    // VscodeTable writes style.width directly onto the first row's cell DOM and
    // caches that cell reference internally (no MutationObserver re-evaluation).
    // The guest↔auth transition replaces the row DOM entirely, so the new cells
    // never receive the width. Keying the table itself rebuilds the web component
    // and resets the internal cache.
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
            // The entry id changes on Connect/Disconnect for ephemeral webhooks,
            // so use the stable index as the React key instead of the id (the list is never reordered).
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
