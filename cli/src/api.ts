import { HttpError } from "./errors";

// 拡張 (extension/core/src/api.ts) と同じ型・エンドポイントを CLI 用に再定義する。
// 拡張側は vscode.AuthenticationSession に依存するためコードはそのままは使えない。

export type WebhookKind = "ephemeral" | "persistent" | "customUrl";

export type Webhook = {
  id: string;
  enabled: boolean;
  destinationUrls?: string[];
  expiresAt?: string | null;
  isCustomSubdomain?: boolean;
  createdAt?: string;
};

export type WebhookSourceRequest = {
  id: string;
  webhookId: string;
  method: string;
  url: string;
  createdAt: string;
  headers: Record<string, string>;
  body: string | null;
};

export type PlanLimits = {
  ephemeral: number;
  persistent: number;
  customUrl: number;
  requestsPerDay: number;
  historyDays: number;
};

export type PlanInfo = {
  key: string;
  name: string;
  limits: PlanLimits;
  customSubdomain: boolean;
};

export type AccountMe = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  plan: PlanInfo;
};

export type Misc = {
  wsUrl: string;
};

export type CreateWebhookOptions =
  | { type: "persistent"; customSubdomain?: string }
  | { type: "ephemeral" };

export class CreateWebhookError extends HttpError {
  readonly kind?: WebhookKind;
  readonly reason?: string;

  constructor(message: string, status: number, body: unknown, kind?: WebhookKind, reason?: string) {
    super(message, status, body);
    this.kind = kind;
    this.reason = reason;
  }
}

const buildAuthHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

const parseJsonSafe = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

export const apiBase = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, "")}/api`;

export const getMisc = async (baseUrl: string, token: string): Promise<Misc> => {
  const res = await fetch(`${apiBase(baseUrl)}/misc`, { headers: buildAuthHeaders(token) });
  if (!res.ok) {
    throw new HttpError(`GET /api/misc failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  return (await res.json()) as Misc;
};

export const getMe = async (baseUrl: string, token: string): Promise<AccountMe> => {
  const res = await fetch(`${apiBase(baseUrl)}/account/me`, { headers: buildAuthHeaders(token) });
  if (!res.ok) {
    throw new HttpError(`GET /api/account/me failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  return (await res.json()) as AccountMe;
};

export const getWebhooks = async (baseUrl: string, token: string): Promise<Webhook[]> => {
  const res = await fetch(`${apiBase(baseUrl)}/webhooks`, { headers: buildAuthHeaders(token) });
  if (!res.ok) {
    throw new HttpError(`GET /api/webhooks failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  const data = (await res.json()) as { webhooks?: Webhook[] };
  return data.webhooks ?? [];
};

export const createWebhook = async (
  baseUrl: string,
  token: string,
  opts: CreateWebhookOptions,
): Promise<Webhook> => {
  const res = await fetch(`${apiBase(baseUrl)}/webhooks`, {
    method: "POST",
    headers: { ...buildAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (res.status === 201) {
    return (await res.json()) as Webhook;
  }
  const body = (await parseJsonSafe(res)) as
    | { message?: string; kind?: WebhookKind; reason?: string }
    | null;
  throw new CreateWebhookError(
    body?.message ?? res.statusText ?? `request failed (${res.status})`,
    res.status,
    body,
    body?.kind,
    body?.reason,
  );
};

export const deleteWebhook = async (
  baseUrl: string,
  token: string,
  webhookId: string,
): Promise<boolean> => {
  const res = await fetch(`${apiBase(baseUrl)}/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(token),
  });
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new HttpError(`DELETE /api/webhooks/${webhookId} failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  return true;
};

export const getWebhookRequests = async (
  baseUrl: string,
  token: string,
  webhookId: string,
  limit: number,
  offset: number,
): Promise<WebhookSourceRequest[]> => {
  const url = new URL(`${apiBase(baseUrl)}/webhooks/${encodeURIComponent(webhookId)}/requests`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url, { headers: buildAuthHeaders(token) });
  if (!res.ok) {
    throw new HttpError(`GET ${url.pathname} failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  const data = (await res.json()) as { requests?: WebhookSourceRequest[] };
  return data.requests ?? [];
};

export const getWebhookSourceRequest = async (
  baseUrl: string,
  token: string,
  webhookId: string,
  requestId: string,
): Promise<WebhookSourceRequest> => {
  const res = await fetch(
    `${apiBase(baseUrl)}/webhooks/${encodeURIComponent(webhookId)}/requests/${encodeURIComponent(requestId)}`,
    { headers: buildAuthHeaders(token) },
  );
  if (!res.ok) {
    throw new HttpError(`GET request detail failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  return (await res.json()) as WebhookSourceRequest;
};

export const exchangeAuthorizationCode = async (
  baseUrl: string,
  body: {
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  },
): Promise<{ accessToken: string }> => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: body.clientId,
    redirect_uri: body.redirectUri,
    code: body.code,
    code_verifier: body.codeVerifier,
  });
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new HttpError(`POST /oauth2/token failed: ${res.status} ${res.statusText}`, res.status, await parseJsonSafe(res));
  }
  return (await res.json()) as { accessToken: string };
};

export const classifyWebhook = (w: Pick<Webhook, "expiresAt" | "isCustomSubdomain">): WebhookKind => {
  if (w.expiresAt) {
    return "ephemeral";
  }
  if (w.isCustomSubdomain) {
    return "customUrl";
  }
  return "persistent";
};
