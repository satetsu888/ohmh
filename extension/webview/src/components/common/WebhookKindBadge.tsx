import { classifyWebhook, type WebhookKind } from "../../../../core/src/api";
import { Webhook } from "../../../../core/src/stateStore";

const labelByKind: Record<WebhookKind, string> = {
  ephemeral: "Ephemeral",
  persistent: "Persistent",
  customUrl: "Custom URL",
};

const colorByKind: Record<WebhookKind, string> = {
  ephemeral: "var(--vscode-charts-yellow, #cca700)",
  persistent: "var(--vscode-charts-blue, #3794ff)",
  customUrl: "var(--vscode-charts-purple, #b180d7)",
};

type Props = {
  webhook: Webhook;
};

/** Small badge that shows a webhook's kind. Anon / authed ephemeral entries
 *  show the "ephemeral" badge even before connect (when id is still empty). */
export const WebhookKindBadge = ({ webhook }: Props) => {
  let kind: WebhookKind;
  if (webhook.isAnonymous || webhook.isEphemeral) {
    kind = 'ephemeral';
  } else if (webhook.id === "") {
    // No ephemeral / anon flag and no id: render nothing (not expected in practice).
    return null;
  } else {
    kind = classifyWebhook(webhook);
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        fontSize: 10,
        lineHeight: "14px",
        borderRadius: 8,
        border: `1px solid ${colorByKind[kind]}`,
        color: colorByKind[kind],
        whiteSpace: "nowrap",
      }}
      title={`${labelByKind[kind]} webhook`}
    >
      {labelByKind[kind]}
    </span>
  );
};
