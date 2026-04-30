import { getWebhookRequests } from "../api";
import { requireSession } from "../session/currentSession";
import { formatTimestamp, renderTable } from "../ui/format";
import { emitJsonEvent, info, isJsonMode } from "../ui/logger";

export type RequestsOptions = {
  webhookId: string;
  limit: number;
  offset: number;
  baseUrlOverride?: string;
};

export const requestsCommand = async (opts: RequestsOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);
  const requests = await getWebhookRequests(
    session.baseUrl,
    session.token,
    opts.webhookId,
    opts.limit,
    opts.offset,
  );

  if (isJsonMode()) {
    emitJsonEvent({ type: "requests", webhookId: opts.webhookId, requests });
    return;
  }

  if (requests.length === 0) {
    info("(no requests)");
    return;
  }

  const table = renderTable(requests, [
    { header: "ID", get: (r) => r.id, maxWidth: 36 },
    { header: "METHOD", get: (r) => r.method },
    { header: "PATH", get: (r) => r.url, maxWidth: 60 },
    { header: "RECEIVED", get: (r) => formatTimestamp(r.createdAt) },
  ]);
  process.stdout.write(table + "\n");
};
