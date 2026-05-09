import { RequestMessage } from "./protocol";

export type ForwardOptions = {
  port: number;
  // ms。応答が来ない / 受信が長引く場合に AbortController で打ち切る。default 30s。
  timeoutMs?: number;
  // bytes。レスポンスボディを読み取る最大量。default 10MB。
  maxResponseBytes?: number;
};

// Result of forwarding to localhost. Never sent back to the server; consumed by the local UI only.
export type ForwardResult = {
  status: number | null;
  headers: Record<string, string>;
  body: string | null;
  durationMs: number;
  error: string | null;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // `fetch` injects Host automatically, so don't forward the original.
  "host",
  // Content-Length is recomputed by the runtime, so drop the original.
  "content-length",
]);

const sanitizeHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
};

const collectResponseHeaders = (response: Response): Record<string, string> => {
  const out: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

// `request.url` はサーバから push される値。SSRF を避けるため localhost を base とした
// URL parse を経由し、絶対 URL や protocol-relative (`//evil.host/...`) で host が
// 上書きされていないことを確認する。pathname + search + hash のみ採用する。
const buildLocalhostUrl = (rawUrl: string, port: number): URL => {
  const base = `http://localhost:${port}`;
  const parsed = new URL(rawUrl, base);
  if (parsed.origin !== base) {
    throw new Error(`refusing to forward to non-localhost origin: ${parsed.origin}`);
  }
  return parsed;
};

const readBodyWithLimit = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {
        // ignore cancellation errors
      });
      throw new Error(`response body exceeded ${maxBytes} bytes`);
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
};

export const forward = async (
  request: RequestMessage,
  options: ForwardOptions
): Promise<ForwardResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const startedAt = Date.now();

  let targetUrl: URL;
  try {
    targetUrl = buildLocalhostUrl(request.url, options.port);
  } catch (err) {
    return {
      status: null,
      headers: {},
      body: null,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit = {
    method: request.method,
    headers: sanitizeHeaders(request.headers),
    signal: controller.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
    init.body = request.body;
  }

  try {
    const res = await fetch(targetUrl.toString(), init);
    const body = await readBodyWithLimit(res, maxResponseBytes);
    return {
      status: res.status,
      headers: collectResponseHeaders(res),
      body,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `forward timed out after ${timeoutMs}ms`
          : err.message
        : String(err);
    return {
      status: null,
      headers: {},
      body: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
};
