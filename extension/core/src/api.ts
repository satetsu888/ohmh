import * as vscode from "vscode";

export type Misc = {
  wsUrl: string;
};

export type WebhookKind = 'ephemeral' | 'persistent' | 'customUrl';

export type Webhook = {
  id: string;
  enabled: boolean;
  destinationUrls: string[];
  // null = persistent / custom URL, ISO string = ephemeral (24h expiry)
  expiresAt?: string | null;
  isCustomSubdomain?: boolean;
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


const BASE_URL = process.env.OH_MY_HOOKS_BASE_URL || "http://localhost:8787";
const API_URL_BASE = `${BASE_URL}/api`;
const WEBHOOK_URL_BASE = BASE_URL;

const authHeader = (session: vscode.AuthenticationSession) => ({
  headers: {
    Authorization: `Bearer ${session.accessToken}`,
  },
});

export const getMisc = async (
  session: vscode.AuthenticationSession
): Promise<Misc> => {
  const res = await fetch(`${API_URL_BASE}/misc`, authHeader(session));
  if (!res.ok) {
    throw new Error(res.statusText);
  }

  return (await res.json()) as Misc;
};

export const getMe = async (
  session: vscode.AuthenticationSession
): Promise<AccountMe> => {
  const res = await fetch(`${API_URL_BASE}/account/me`, authHeader(session));
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return (await res.json()) as AccountMe;
};

export const getWebhooks = async (
  session: vscode.AuthenticationSession
): Promise<Webhook[]> => {
  const res = await fetch(`${API_URL_BASE}/webhooks`, authHeader(session));
  if (!res.ok) {
    throw new Error(res.statusText);
  }

  return (await res.json()).webhooks as Webhook[];
};


export const getWebhookSourceRequest = async (session: vscode.AuthenticationSession, webhookId: string, sourceRequestId: string) => {
  const res = await fetch(`${API_URL_BASE}/webhooks/${webhookId}/requests/${sourceRequestId}`, {
    method: "GET",
    ...authHeader(session),
  });
  if (!res.ok) {
    throw new Error(res.statusText);
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
    throw new Error(res.statusText);
  }

  const data = await res.json();
  return data.requests || [];
};

export const buildWebhookUrl = (webhookId: string): string => {
  const url = new URL('/', WEBHOOK_URL_BASE);
  return url.toString().replace(url.host, `${webhookId}.${url.host}`);
};

export type CreateWebhookOptions = {
  type: 'ephemeral' | 'persistent';
  customSubdomain?: string;
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
  webhook: Pick<Webhook, "expiresAt" | "isCustomSubdomain">,
): WebhookKind => {
  if (webhook.expiresAt) {
    return 'ephemeral';
  }
  if (webhook.isCustomSubdomain) {
    return 'customUrl';
  }
  return 'persistent';
};
