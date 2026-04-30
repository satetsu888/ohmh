import { forward } from "../../../shared/forwarder";
import type { RequestMessage } from "../../../shared/protocol";
import { getWebhookSourceRequest } from "../api";
import { CliError, EXIT_BAD_INPUT } from "../errors";
import { requireSession } from "../session/currentSession";
import { emitJsonEvent, info, isJsonMode, success } from "../ui/logger";

export type ResendOptions = {
  webhookId: string;
  requestId: string;
  port: number;
  baseUrlOverride?: string;
};

export const resendCommand = async (opts: ResendOptions): Promise<void> => {
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    throw new CliError(`invalid port: ${opts.port}`, EXIT_BAD_INPUT);
  }

  const session = await requireSession(opts.baseUrlOverride);
  const sourceRequest = await getWebhookSourceRequest(
    session.baseUrl,
    session.token,
    opts.webhookId,
    opts.requestId,
  );

  // shared/forwarder は RequestMessage 型を期待する。webhookId / sourceRequestId を埋めて渡す。
  const requestMessage: RequestMessage = {
    type: "request",
    sourceRequestId: sourceRequest.id,
    webhookId: sourceRequest.webhookId,
    method: sourceRequest.method,
    url: sourceRequest.url,
    headers: sourceRequest.headers,
    body: sourceRequest.body,
    receivedAt: sourceRequest.createdAt,
  };

  const result = await forward(requestMessage, { port: opts.port });

  if (isJsonMode()) {
    emitJsonEvent({
      type: "resend",
      webhookId: opts.webhookId,
      requestId: opts.requestId,
      port: opts.port,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    });
    return;
  }
  if (result.error) {
    throw new CliError(`resend failed: ${result.error}`);
  }
  success(`Resent → http://localhost:${opts.port} (${result.status} in ${result.durationMs} ms)`);
  info(`(forwarded locally — server has no record of this resend)`);
};
