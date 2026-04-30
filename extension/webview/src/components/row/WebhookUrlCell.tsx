import { useState } from "react";
import { VscodeTableCell } from "@vscode-elements/react-elements";
import { buildWebhookUrl } from "../../../../core/src/api";
import { Webhook } from "../../../../core/src/stateStore";
import { IconButton } from "../common/IconButton";
import { WebhookKindBadge } from "../common/WebhookKindBadge";

type Props = {
  webhook: Webhook;
};

const COPIED_RESET_MS = 2000;

/** webhook URL とコピーボタン + kind バッジ。id 未払い出しの間はセルを空に保つ。 */
export const WebhookUrlCell = ({ webhook }: Props) => {
  const [copied, setCopied] = useState(false);

  const url = webhook.id ? buildWebhookUrl(webhook.id) : "";
  const hasUrl = url !== "";

  const handleCopy = async () => {
    if (!hasUrl) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (err) {
      console.error("Failed to copy webhook url", err);
    }
  };

  return (
    <VscodeTableCell>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
        <WebhookKindBadge webhook={webhook} />
        {hasUrl && (
          <>
            <span style={{ fontSize: 12, fontFamily: "monospace" }}>{url}</span>
            <IconButton
              icon={copied ? "check" : "copy"}
              title={copied ? "Copied!" : "Copy URL"}
              onClick={handleCopy}
            />
          </>
        )}
      </div>
    </VscodeTableCell>
  );
};
