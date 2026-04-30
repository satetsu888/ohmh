import { VscodeTableRow, VscodeTableCell } from "@vscode-elements/react-elements";
import { useHover } from "../../hooks/useHover";
import { WebhookSourceRequest } from "../../../../core/src/api";
import { IconButton } from "../common/IconButton";
import { formatRelativeTime } from "../../utils/time";
import { ForwardResult } from "../../hooks/useExtensionState";

type Props = {
  request: WebhookSourceRequest;
  /** Resend 可能か (= webhook が connected か) */
  canResend: boolean;
  /** 直近の forward 結果 (このセッションで forward していなければ null) */
  forwardResult: ForwardResult | null;
  onSelect: () => void;
  onResend: () => void;
};

const requestPath = (rawUrl: string): string => {
  if (rawUrl.startsWith("http")) {
    try {
      return new URL(rawUrl).pathname;
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
};

const forwardBadgeColor = (result: ForwardResult): string => {
  if (result.error !== null) return "var(--vscode-errorForeground)";
  if (result.status === null) return "var(--vscode-descriptionForeground)";
  if (result.status >= 200 && result.status < 300) return "var(--vscode-testing-iconPassed, var(--vscode-charts-green))";
  if (result.status >= 300 && result.status < 400) return "var(--vscode-charts-blue)";
  return "var(--vscode-errorForeground)";
};

const ForwardBadge = ({ result }: { result: ForwardResult }) => {
  const color = forwardBadgeColor(result);
  const label = result.error !== null
    ? "failed"
    : result.status !== null
      ? String(result.status)
      : "—";
  const title = result.error !== null
    ? `Forward failed: ${result.error}`
    : `Forward responded ${result.status} in ${result.durationMs}ms`;
  return (
    <span
      title={title}
      style={{
        fontFamily: "monospace",
        fontSize: 11,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: "0 4px",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
};

/** 展開時に出る、各リクエスト履歴 1 行。 */
export const RequestRow = ({ request, canResend, forwardResult, onSelect, onResend }: Props) => {
  const { hovered, props: hoverProps } = useHover();
  const path = requestPath(request.url);

  return (
    <VscodeTableRow
      onClick={onSelect}
      {...hoverProps}
      style={{
        backgroundColor: hovered
          ? "var(--vscode-list-activeSelectionBackground)"
          : "var(--vscode-list-hoverBackground)",
        transition: "background-color 0.1s ease",
        cursor: "pointer",
      }}
    >
      <VscodeTableCell />
      <VscodeTableCell />
      <VscodeTableCell>
        <div
          style={{
            textAlign: "right",
            paddingRight: 10,
            fontSize: 12,
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          {formatRelativeTime(request.createdAt)}
        </div>
      </VscodeTableCell>
      <VscodeTableCell>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            paddingRight: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: "monospace", fontWeight: "bold", flexShrink: 0 }}>
              {request.method}
            </span>
            <span
              title={path}
              style={{
                fontFamily: "monospace",
                color: "var(--vscode-descriptionForeground)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {path}
            </span>
            {forwardResult && <ForwardBadge result={forwardResult} />}
          </div>
          <IconButton
            icon="debug-restart"
            disabled={!canResend}
            title={canResend ? "Resend request" : "Connect to a local port to resend requests"}
            style={{ marginLeft: 8 }}
            onClick={(e) => {
              e.stopPropagation();
              onResend();
            }}
          />
        </div>
      </VscodeTableCell>
    </VscodeTableRow>
  );
};
