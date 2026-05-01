import { v4 as uuid } from "uuid";
import { WSClient } from "../../../shared/wsClient";
import { forward } from "../../../shared/forwarder";
import type { ForwardResult } from "../../../shared/forwarder";
import type { RequestMessage } from "../../../shared/protocol";
import { getMisc } from "../api";
import { buildWebhookUrl } from "../config";
import type { ResolvedSession } from "../session/currentSession";
import { formatTimeOnly } from "../ui/format";
import {
  emitHumanLine,
  emitJsonEvent,
  error,
  info,
  isJsonMode,
  success,
  warn,
} from "../ui/logger";

export type RunAuthedOptions = {
  session: ResolvedSession;
  port: number;
  // null = create an ephemeral webhook (subscribeEphemeral).
  // string = subscribe to an existing webhook by id.
  webhookId: string | null;
};

export const runAuthedConnect = async (opts: RunAuthedOptions): Promise<void> => {
  const { session, port, webhookId } = opts;

  const misc = await getMisc(session.baseUrl, session.token);
  const wsUrl = misc.wsUrl;

  const sessionId = uuid();
  let activeWebhookId: string | null = webhookId;

  const client = new WSClient({
    wsUrl,
    clientType: "cli",
    sessionId,
    getAccessToken: async () => session.token,
    onRequest: async (req: RequestMessage) => {
      const result = await forward(req, { port });
      reportRequest(req, result);
    },
    onEphemeralWebhookCreated: (id) => {
      activeWebhookId = id;
      const url = buildWebhookUrl(session.baseUrl, id);
      if (isJsonMode()) {
        emitJsonEvent({ type: "ready", mode: "ephemeral", webhookId: id, url, forwardPort: port });
      } else {
        success("ephemeral webhook ready");
        info(`URL    : ${url}`);
        info(`forward: → http://localhost:${port}`);
        info(`status : waiting for requests (Ctrl+C to stop)`);
        info("");
      }
    },
  });

  client.on("error", (err: Error) => {
    warn(err.message);
  });
  client.on("close", () => {
    if (!isJsonMode()) {
      info("disconnected from server (will retry)…");
    }
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (!isJsonMode()) {
      info("");
      info("shutting down…");
    }
    try {
      if (activeWebhookId) {
        if (webhookId === null) {
          // Ephemeral: tell the server to delete the webhook via unsubscribeEphemeral.
          client.unsubscribeEphemeral(activeWebhookId);
        } else {
          // Existing webhook: only unsubscribe this session; the webhook itself stays.
          client.unsubscribe(activeWebhookId);
        }
      }
      await client.close();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  if (!isJsonMode()) {
    info(`connecting to ${prettyHost(session.baseUrl)}…`);
  }
  try {
    await client.connect();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Send the subscribe once the connection is up.
  if (webhookId === null) {
    client.subscribeEphemeral();
  } else {
    // Subscribe to an existing webhook. There is no dedicated subscribe-ack message,
    // so print the URL immediately.
    const url = buildWebhookUrl(session.baseUrl, webhookId);
    if (isJsonMode()) {
      emitJsonEvent({
        type: "ready",
        mode: "persistent",
        webhookId,
        url,
        forwardPort: port,
      });
    } else {
      success(`subscribed to ${webhookId}`);
      info(`URL    : ${url}`);
      info(`forward: → http://localhost:${port}`);
      info(`status : waiting for requests (Ctrl+C to stop)`);
      info("");
    }
    client.subscribe(webhookId);
  }

  await new Promise<void>(() => {
    /* never resolves; the process exits via the SIGINT handler */
  });
};

const reportRequest = (req: RequestMessage, result: ForwardResult): void => {
  if (isJsonMode()) {
    emitJsonEvent({
      type: "request",
      ts: new Date().toISOString(),
      sourceRequestId: req.sourceRequestId,
      webhookId: req.webhookId,
      method: req.method,
      path: req.url,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    });
    return;
  }
  const time = formatTimeOnly(new Date());
  const method = req.method.padEnd(6);
  const path = req.url;
  const statusText = result.status !== null ? String(result.status) : "ERR ";
  const tail = result.error ? `  upstream error: ${result.error}` : "";
  emitHumanLine(`[${time}] ${method} ${path}  ${statusText} (${result.durationMs} ms)${tail}`);
};

const prettyHost = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};
