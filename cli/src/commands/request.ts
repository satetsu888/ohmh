import { getWebhookSourceRequest } from "../api";
import { requireSession } from "../session/currentSession";
import { formatTimestamp } from "../ui/format";
import { emitJsonEvent, info, isJsonMode } from "../ui/logger";

export type RequestOptions = {
  webhookId: string;
  requestId: string;
  baseUrlOverride?: string;
};

export const requestCommand = async (opts: RequestOptions): Promise<void> => {
  const session = await requireSession(opts.baseUrlOverride);
  const req = await getWebhookSourceRequest(
    session.baseUrl,
    session.token,
    opts.webhookId,
    opts.requestId,
  );

  if (isJsonMode()) {
    emitJsonEvent({ type: "request", request: req });
    return;
  }

  info(`ID         : ${req.id}`);
  info(`Webhook    : ${req.webhookId}`);
  info(`Method     : ${req.method}`);
  info(`Path       : ${req.url}`);
  info(`Received   : ${formatTimestamp(req.createdAt)}`);
  info("");
  info("Headers:");
  for (const [k, v] of Object.entries(req.headers)) {
    info(`  ${k}: ${v}`);
  }
  info("");
  info("Body:");
  process.stdout.write((req.body ?? "") + "\n");
};
