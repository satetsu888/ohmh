import * as vscode from "vscode";

export type Misc = {
  wsUrl: string;
};

export type WebhookKind = 'ephemeral' | 'persistent';

export type Webhook = {
  id: string;
  enabled: boolean;
  destinationUrls: string[];
  // null = persistent, ISO string = ephemeral (24h expiry)
  expiresAt?: string | null;
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
  requestsPerDay: number;
  historyDays: number;
};

export type PlanInfo = {
  key: string;
  name: string;
  limits: PlanLimits;
};

export type AccountMe = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  plan: PlanInfo;
};


// webpack DefinePlugin で build 時に置換される。
const BASE_URL = process.env.OH_MY_HOOKS_BASE_URL!;
const API_URL_BASE = `${BASE_URL}/api`;
const WEBHOOK_URL_BASE = BASE_URL;

const authHeader = (session: vscode.AuthenticationSession) => ({
  headers: {
    Authorization: `Bearer ${session.accessToken}`,
  },
});

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export const getMisc = async (
  session: vscode.AuthenticationSession
): Promise<Misc> => {
  const res = await fetch(`${API_URL_BASE}/misc`, authHeader(session));
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }

  return (await res.json()) as Misc;
};

export const getMe = async (
  session: vscode.AuthenticationSession
): Promise<AccountMe> => {
  const res = await fetch(`${API_URL_BASE}/account/me`, authHeader(session));
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return (await res.json()) as AccountMe;
};

export const getWebhooks = async (
  session: vscode.AuthenticationSession
): Promise<Webhook[]> => {
  const res = await fetch(`${API_URL_BASE}/webhooks`, authHeader(session));
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }

  return (await res.json()).webhooks as Webhook[];
};


export const getWebhookSourceRequest = async (session: vscode.AuthenticationSession, webhookId: string, sourceRequestId: string) => {
  const res = await fetch(`${API_URL_BASE}/webhooks/${webhookId}/requests/${sourceRequestId}`, {
    method: "GET",
    ...authHeader(session),
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }

  return await res.json() as WebhookSourceRequest;
};

export const getWebhookRequests = async (
  session: vscode.AuthenticationSession,
  webhookId: string,
  limit: number = 5
): Promise<WebhookSourceRequest[]> => {
  const res = await fetch(`${API_URL_BASE}/webhooks/${webhookId}/requests?limit=${limit}`, {
    method: "GET",
    ...authHeader(session),
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }

  const data = await res.json();
  return data.requests || [];
};

// Webhook URL は base host の先頭 subdomain を webhook id で置換した形にする
// (例: https://ohmh.satetsu888.dev + ohmh-abc → https://ohmh-abc.satetsu888.dev/)。
// hostname に "." が無い (localhost など) 場合は先頭に prepend する。
export const buildWebhookUrl = (webhookId: string): string => {
  const u = new URL('/', WEBHOOK_URL_BASE);
  const parts = u.hostname.split(".");
  if (parts.length > 1) {
    parts[0] = webhookId;
  } else {
    parts.unshift(webhookId);
  }
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${parts.join(".")}${port}/`;
};

export type CreateWebhookOptions = {
  type: 'ephemeral' | 'persistent';
};

export class CreateWebhookError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kind?: WebhookKind,
    public readonly reason?: string,
  ) {
    super(message);
  }
}

export const createWebhook = async (
  session: vscode.AuthenticationSession,
  opts: CreateWebhookOptions = { type: 'persistent' },
): Promise<Webhook> => {
  const res = await fetch(`${API_URL_BASE}/webhooks`, {
    method: "POST",
    headers: {
      ...authHeader(session).headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts),
  });

  if (res.status === 201) {
    return (await res.json()) as Webhook;
  }

  let parsed: { message?: string; kind?: WebhookKind; reason?: string } = {};
  try {
    parsed = await res.json() as typeof parsed;
  } catch {
    // not JSON
  }
  throw new CreateWebhookError(
    parsed.message || res.statusText || `request failed (${res.status})`,
    res.status,
    parsed.kind,
    parsed.reason,
  );
};

export const classifyWebhook = (
  webhook: Pick<Webhook, "expiresAt">,
): WebhookKind => {
  if (webhook.expiresAt) {
    return 'ephemeral';
  }
  return 'persistent';
};
