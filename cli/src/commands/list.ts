import { classifyWebhook, getWebhooks } from "../api";
import { buildWebhookUrl } from "../config";
import { requireSession } from "../session/currentSession";
import { formatTimestamp, renderTable } from "../ui/format";
import { emitJsonEvent, info, isJsonMode } from "../ui/logger";

export type ListOptions = {
  baseUrlOverride?: string;
};

const KIND_LABEL: Record<string, string> = {
  ephemeral: "ephemeral",
  persistent: "persistent",
  customUrl: "custom URL",
};

export const listCommand = async (opts: ListOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);
  const webhooks = await getWebhooks(session.baseUrl, session.token);

  if (isJsonMode()) {
    emitJsonEvent({ type: "list", webhooks });
    return;
  }

  if (webhooks.length === 0) {
    info("(no webhooks. Run `ohmh create` to make one.)");
    return;
  }

  const table = renderTable(webhooks, [
    { header: "ID", get: (w) => w.id, maxWidth: 24 },
    { header: "KIND", get: (w) => KIND_LABEL[classifyWebhook(w)] ?? "?" },
    { header: "URL", get: (w) => buildWebhookUrl(session.baseUrl, w.id), maxWidth: 60 },
    {
      header: "CREATED",
      get: (w) => (w.createdAt ? formatTimestamp(w.createdAt) : "-"),
    },
  ]);
  process.stdout.write(table + "\n");
};
