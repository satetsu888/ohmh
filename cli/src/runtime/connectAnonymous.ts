import { v4 as uuid } from "uuid";
import { WSClient } from "../../../shared/wsClient";
import { forward } from "../../../shared/forwarder";
import type { ForwardResult } from "../../../shared/forwarder";
import type { RequestMessage } from "../../../shared/protocol";
import { buildWebhookUrl, buildWsUrl } from "../config";
import { EXIT_GENERAL_ERROR } from "../errors";
import {
  emitHumanLine,
  emitJsonError,
  emitJsonEvent,
  error,
  info,
  isJsonMode,
  success,
  warn,
} from "../ui/logger";
import { formatTimeOnly } from "../ui/format";
import { unlinkReadyFile, writeReadyFile } from "./readyFile";

export type RunAnonymousOptions = {
  baseUrl: string;
  port: number;
  readyFile?: string;
};

export const runAnonymousConnect = async (opts: RunAnonymousOptions): Promise<void> => {
  const wsUrl = buildWsUrl(opts.baseUrl);
  const sessionId = uuid();

  const client = new WSClient({
    wsUrl,
    clientType: "cli",
    sessionId,
    anonymous: true,
    onRequest: async (req: RequestMessage) => {
      const result = await forward(req, { port: opts.port });
      reportRequest(req, result);
    },
    onAnonymousWebhookCreated: (id) => {
      const url = buildWebhookUrl(opts.baseUrl, id);
      if (opts.readyFile) {
        writeReadyFile(opts.readyFile, { url, webhookId: id, mode: "anonymous" });
      }
      if (isJsonMode()) {
        emitJsonEvent({
          type: "ready",
          mode: "anonymous",
          webhookId: id,
          url,
          forwardPort: opts.port,
        });
      } else {
        success("anonymous webhook ready");
        info(`URL    : ${url}`);
        info(`forward: → http://localhost:${opts.port}`);
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
      info("disconnected from server");
    }
  });

  // Graceful shutdown on SIGINT / SIGTERM. The server-side anon webhook is deleted
  // automatically when the WS closes.
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
      await client.close();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
    if (opts.readyFile) {
      unlinkReadyFile(opts.readyFile);
    }
    // The anonymous webhook is deleted by the server when the WS closes; no REST call needed.
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  if (!isJsonMode()) {
    info(`connecting to ${prettyHost(opts.baseUrl)}…`);
  }
  try {
    await client.connect();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    emitJsonError(err, EXIT_GENERAL_ERROR);
    process.exit(EXIT_GENERAL_ERROR);
  }

  // After connecting, just wait for server-pushed requests. The promise never
  // resolves; the process exits via the SIGINT/SIGTERM handler.
  await new Promise<void>(() => {
    /* never resolves */
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
  const statusText =
    result.status !== null ? String(result.status) : "ERR ";
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
