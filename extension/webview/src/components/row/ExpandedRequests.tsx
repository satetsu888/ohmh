import { ReactNode } from "react";
import { VscodeTableRow, VscodeTableCell } from "@vscode-elements/react-elements";
import { WebhookSourceRequest } from "../../../../core/src/api";
import { RequestRow } from "./RequestRow";
import { ForwardResult } from "../../hooks/useExtensionState";

type Props = {
  loading: boolean;
  requests: WebhookSourceRequest[];
  canResend: boolean;
  forwardResults: Record<string, ForwardResult>;
  onSelect: (request: WebhookSourceRequest) => void;
  onResend: (request: WebhookSourceRequest) => void;
};

const MessageRow = ({ children }: { children: ReactNode }) => (
  <VscodeTableRow>
    <VscodeTableCell />
    <VscodeTableCell />
    <VscodeTableCell />
    <VscodeTableCell>
      <div style={{ textAlign: "center", padding: 10, color: "var(--vscode-descriptionForeground)" }}>
        {children}
      </div>
    </VscodeTableCell>
  </VscodeTableRow>
);

const MAX_ROWS = 5;

/** 行が展開されているときの「履歴ローディング / 0件 / 一覧」表示。 */
export const ExpandedRequests = ({
  loading,
  requests,
  canResend,
  forwardResults,
  onSelect,
  onResend,
}: Props) => {
  if (loading) {
    return (
      <MessageRow>
        <span className="codicon codicon-loading oh-my-hooks-spin" style={{ fontSize: 16 }} />
      </MessageRow>
    );
  }
  if (requests.length === 0) {
    return <MessageRow>No requests yet</MessageRow>;
  }
  return (
    <>
      {requests.slice(0, MAX_ROWS).map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          canResend={canResend}
          forwardResult={forwardResults[request.id] ?? null}
          onSelect={() => onSelect(request)}
          onResend={() => onResend(request)}
        />
      ))}
    </>
  );
};
