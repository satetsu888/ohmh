import { RequestMessage } from "./protocol";

export type ForwardOptions = {
  port: number;
};

// localhost への forward 結果。サーバへは返さず、ローカル UI 表示のみに使う。
export type ForwardResult = {
  status: number | null;
  headers: Record<string, string>;
  body: string | null;
  durationMs: number;
  error: string | null;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // host は fetch が自動付与するため明示的に渡さない
  "host",
  // forwarder 側で再構築するため content-length も除外
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

export const forward = async (
  request: RequestMessage,
  options: ForwardOptions
): Promise<ForwardResult> => {
  const targetUrl = `http://localhost:${options.port}${request.url}`;
  const init: RequestInit = {
    method: request.method,
    headers: sanitizeHeaders(request.headers),
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
    init.body = request.body;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(targetUrl, init);
    const body = await res.text();
    return {
      status: res.status,
      headers: collectResponseHeaders(res),
      body,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return {
      status: null,
      headers: {},
      body: null,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
